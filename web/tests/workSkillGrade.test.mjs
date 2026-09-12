import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

globalThis.window = {
  location: {
    hostname: "localhost",
    port: "5580",
    protocol: "http:",
  },
};

const server = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "silent",
  root: process.cwd(),
  server: { middlewareMode: true },
});

const {
  addUnratedWorkTypeRating,
  getWorkSkillGrade,
  removeWorkTypeRating,
  resolveRatingForGradeSelection,
} = await server.ssrLoadModule("/src/domain/workSkillGrade.ts");
const { WorkerWorkTypeCell } = await server.ssrLoadModule(
  "/src/components/WorkerWorkTypeCell.tsx",
);
const { createWorkType, fetchWorkTypes, updateWorkerWorkTypes } =
  await server.ssrLoadModule("/src/api/workforceApi.ts");

after(async () => {
  await server.close();
});

test("ratings 0 through 5 and a missing value map to the documented grades", () => {
  assert.deepEqual(
    [undefined, 0, 1, 2, 3, 4, 5].map(getWorkSkillGrade),
    ["UNRATED", "UNRATED", "D", "C", "C", "B", "A"],
  );
});

test("a changed grade uses its representative rating", () => {
  assert.equal(resolveRatingForGradeSelection(0, "A"), 5);
  assert.equal(resolveRatingForGradeSelection(0, "B"), 4);
  assert.equal(resolveRatingForGradeSelection(0, "C"), 3);
  assert.equal(resolveRatingForGradeSelection(0, "D"), 1);
  assert.equal(resolveRatingForGradeSelection(5, "UNRATED"), 0);
});

test("selecting the currently displayed grade preserves the original numeric rating", () => {
  assert.equal(resolveRatingForGradeSelection(2, "C"), 2);
  assert.equal(resolveRatingForGradeSelection(3, "C"), 3);
  assert.equal(resolveRatingForGradeSelection(0, "UNRATED"), 0);
});

test("adding an existing work type keeps its rating and a new work type starts unrated", () => {
  const existing = { garlic_harvest: 2 };

  assert.deepEqual(addUnratedWorkTypeRating(existing, "garlic_harvest"), existing);
  assert.deepEqual(addUnratedWorkTypeRating(existing, "onion_sorting"), {
    garlic_harvest: 2,
    onion_sorting: 0,
  });
  assert.deepEqual(existing, { garlic_harvest: 2 });
});

test("changing to unrated keeps the work type while deleting removes its rating entry", () => {
  const unrated = {
    garlic_harvest: resolveRatingForGradeSelection(5, "UNRATED"),
  };

  assert.deepEqual(unrated, { garlic_harvest: 0 });
  assert.deepEqual(removeWorkTypeRating(unrated, "garlic_harvest"), {});
});

test("the grade UI renders C for rating 2 and remains hidden when showRatings is false", () => {
  const baseProps = {
    onChange: () => {},
    selectedCodes: ["garlic_harvest"],
    selectedRatings: { garlic_harvest: 2 },
    workTypeOptions: [{ code: "garlic_harvest", name: "아주 긴 마늘 수확 작업 이름" }],
  };
  const gradeMarkup = renderToStaticMarkup(
    React.createElement(WorkerWorkTypeCell, baseProps),
  );
  const hiddenMarkup = renderToStaticMarkup(
    React.createElement(WorkerWorkTypeCell, { ...baseProps, showRatings: false }),
  );

  assert.match(gradeMarkup, /숙련도 C, 초보\. 등급 선택/);
  assert.doesNotMatch(gradeMarkup, /★|☆|별점/);
  assert.doesNotMatch(hiddenMarkup, /숙련도 C|숙련도 등급/);
});

test("a failed work-type save can be retried without changing the numeric payload", async () => {
  const originalFetch = globalThis.fetch;
  const requestBodies = [];
  let attempt = 0;

  globalThis.fetch = async (_url, init) => {
    requestBodies.push(JSON.parse(init.body));
    attempt += 1;

    if (attempt === 1) {
      return new Response(null, { status: 500 });
    }

    return Response.json({ workers: [] });
  };

  try {
    await assert.rejects(
      updateWorkerWorkTypes(
        "test",
        "11111111-1111-4111-8111-111111111111",
        ["garlic_harvest"],
        { garlic_harvest: 2 },
      ),
      new Error("가능한 작업을 저장하지 못했습니다."),
    );

    assert.deepEqual(
      await updateWorkerWorkTypes(
        "test",
        "11111111-1111-4111-8111-111111111111",
        ["garlic_harvest"],
        { garlic_harvest: 2 },
      ),
      [],
    );
    assert.deepEqual(requestBodies, [
      {
        workTypeCodes: ["garlic_harvest"],
        workTypeRatings: { garlic_harvest: 2 },
      },
      {
        workTypeCodes: ["garlic_harvest"],
        workTypeRatings: { garlic_harvest: 2 },
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("work-type lookup and creation keep the agency login and creation payload", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    const workType = { code: "custom_1", name: "마늘 심기" };
    return Response.json(init.method === "POST" ? workType : [workType]);
  };

  try {
    assert.deepEqual(await fetchWorkTypes("test user"), [
      { code: "custom_1", name: "마늘 심기" },
    ]);
    assert.deepEqual(await createWorkType("test user", "마늘 심기"), {
      code: "custom_1",
      name: "마늘 심기",
    });
    assert.match(requests[0].url, /work-types\?loginId=test%20user$/);
    assert.equal(requests[1].init.method, "POST");
    assert.deepEqual(JSON.parse(requests[1].init.body), { name: "마늘 심기" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
