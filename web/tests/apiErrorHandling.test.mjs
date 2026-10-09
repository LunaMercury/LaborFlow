import assert from "node:assert/strict";
import { after, test } from "node:test";
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

const { parseErrorMessage } = await server.ssrLoadModule("/src/api/parseErrorMessage.ts");
const {
  WorkerSeparationConflictError,
  createScheduleTask,
  fetchScheduleTasks,
  fetchAssignmentHistory,
  rescheduleScheduleRange,
  updateScheduleTask,
} = await server.ssrLoadModule("/src/api/scheduleApi.ts");

after(async () => {
  await server.close();
});

const { buildImportedAssignments } = await server.ssrLoadModule("/src/components/assignmentHistory.ts");

test("assignment history requests are read-only and preserve office, target, date and cursor", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return Response.json({ entries: [], nextBeforeDate: null });
  };
  try {
    assert.deepEqual(await fetchAssignmentHistory("sample office", "task-id", "2026-09-04"), { entries: [], nextBeforeDate: null });
    await fetchAssignmentHistory("sample office", "task-id", "2026-09-04", "2026-09-02");
    assert.equal(calls[0].url.pathname, "/api/schedule/tasks/task-id/assignment-history");
    assert.equal(calls[0].url.searchParams.get("loginId"), "sample office");
    assert.equal(calls[0].url.searchParams.get("workDate"), "2026-09-04");
    assert.equal(calls[0].url.searchParams.has("beforeDate"), false);
    assert.equal(calls[1].url.searchParams.get("beforeDate"), "2026-09-02");
    assert.deepEqual(calls[0].init, { cache: "no-store" });
  } finally { globalThis.fetch = originalFetch; }
});

test("history errors retain the message and can be retried without a write", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ message: "가상 이력 오류" }, { status: 400 });
  try {
    await assert.rejects(fetchAssignmentHistory("sample", "task", "2026-09-04"), new Error("가상 이력 오류"));
    globalThis.fetch = async () => Response.json({ entries: [], nextBeforeDate: null });
    assert.deepEqual(await fetchAssignmentHistory("sample", "task", "2026-09-04"), { entries: [], nextBeforeDate: null });
  } finally { globalThis.fetch = originalFetch; }
});

test("import preserves areas and headcounts while excluding guests, replaced, missing and busy workers", () => {
  const source = [
    { workerProfileUuid: "a", area: "men", workerCount: 3 },
    { workerProfileUuid: "b", area: "women", workerCount: 1 },
    { workerProfileUuid: "busy", area: "men", workerCount: 1 },
    { workerProfileUuid: "deleted", area: "women", workerCount: 1 },
    { workerProfileUuid: "old", area: "men", workerCount: 1, assignmentStatus: "replaced" },
    { participantType: "guest", workerProfileUuid: null, area: "women", workerCount: 2 },
  ];
  const result = buildImportedAssignments(source, new Set(["a", "b", "busy", "old"]), new Set(["busy"]));
  assert.deepEqual(result.assignments, { men: ["a"], women: ["b"], workerCounts: { a: 3, b: 1 } });
  assert.equal(result.sourceCount, 4);
  assert.equal(result.importedCount, 2);
  assert.equal(source[0].workerCount, 3);
});

test("empty or entirely excluded history cannot produce an importable draft", () => {
  assert.equal(buildImportedAssignments([], new Set(), new Set()).importedCount, 0);
  assert.equal(buildImportedAssignments([{ workerProfileUuid: "a", area: "men", workerCount: 1 }], new Set(["a"]), new Set(["a"])).importedCount, 0);
});

test("parseErrorMessage returns a JSON message", async () => {
  const response = Response.json({ message: "서버 오류 메시지" }, { status: 400 });

  assert.equal(await parseErrorMessage(response, "기본 오류"), "서버 오류 메시지");
});

test("parseErrorMessage uses the fallback for a missing or empty message", async () => {
  const missingMessage = Response.json({}, { status: 400 });
  const emptyMessage = Response.json({ message: "" }, { status: 400 });

  assert.equal(await parseErrorMessage(missingMessage, "기본 오류"), "기본 오류");
  assert.equal(await parseErrorMessage(emptyMessage, "기본 오류"), "기본 오류");
});

test("parseErrorMessage uses the fallback for malformed, empty, or non-JSON bodies", async () => {
  const malformedJson = new Response("{", {
    headers: { "Content-Type": "application/json" },
    status: 400,
  });
  const emptyBody = new Response(null, { status: 400 });
  const textBody = new Response("plain text", { status: 400 });

  assert.equal(await parseErrorMessage(malformedJson, "기본 오류"), "기본 오류");
  assert.equal(await parseErrorMessage(emptyBody, "기본 오류"), "기본 오류");
  assert.equal(await parseErrorMessage(textBody, "기본 오류"), "기본 오류");
});

test("schedule update preserves separation conflicts from a 409 response", async () => {
  const originalFetch = globalThis.fetch;
  const conflicts = [
    {
      reason: "같은 현장 배치 전 확인",
      ruleUuid: "11111111-1111-4111-8111-111111111111",
      workerNameA: "작업자 A",
      workerNameB: "작업자 B",
      workerProfileUuidA: "22222222-2222-4222-8222-222222222222",
      workerProfileUuidB: "33333333-3333-4333-8333-333333333333",
    },
  ];
  let bodyReadCount = 0;

  globalThis.fetch = async () => ({
    json: async () => {
      bodyReadCount += 1;
      return {
        code: "WORKER_SEPARATION_CONFLICT",
        conflicts,
        message: "동시 배치 확인이 필요합니다.",
      };
    },
    ok: false,
    status: 409,
  });

  try {
    await assert.rejects(
      updateScheduleTask("test", "2026-09-08", "task-1", {
        address: "가상 주소",
        assignments: [],
        clientWorkSiteUuid: null,
        endTime: "17:00",
        memo: "",
        ownerUuid: "44444444-4444-4444-8444-444444444444",
        requiredMen: 1,
        requiredWomen: 1,
        siteMemo: "",
        siteName: "가상 현장",
        startTime: "07:00",
        title: "가상 작업",
        workTypeCodes: [],
      }),
      (error) => {
        assert.ok(error instanceof WorkerSeparationConflictError);
        assert.equal(error.message, "동시 배치 확인이 필요합니다.");
        assert.deepEqual(error.conflicts, conflicts);
        return true;
      },
    );
    assert.equal(bodyReadCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ordinary API errors still expose the server message where they did before", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ message: "일정 입력값을 확인해 주세요." }, { status: 400 });

  try {
    await assert.rejects(
      createScheduleTask("test", {
        address: "가상 주소",
        clientWorkSiteUuid: null,
        endDate: "2026-09-08",
        endTime: "17:00",
        memo: "",
        ownerName: "가상 거래처",
        ownerNickname: "",
        ownerPhone: "01012345678",
        ownerUuid: null,
        requiredMen: 1,
        requiredWomen: 1,
        siteMemo: "",
        siteName: "가상 현장",
        startDate: "2026-09-08",
        startTime: "07:00",
        title: "가상 작업",
        workTypeCodes: [],
      }),
      new Error("일정 입력값을 확인해 주세요."),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fixed schedule list errors do not start exposing server messages", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ message: "노출하지 않을 서버 메시지" }, { status: 500 });

  try {
    await assert.rejects(
      fetchScheduleTasks("test", "2026-09-08"),
      new Error("작업 일정을 불러오지 못했습니다."),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bodyless successful range updates still complete without parsing a response body", async () => {
  const originalFetch = globalThis.fetch;
  let requestInit;
  globalThis.fetch = async (_url, init) => {
    requestInit = init;
    return new Response(null, { status: 204 });
  };

  try {
    const result = await rescheduleScheduleRange("test", {
      endDate: "2026-09-10",
      startDate: "2026-09-08",
      taskIds: ["task-1"],
    });

    assert.equal(result, undefined);
    assert.equal(requestInit.method, "PUT");
    assert.deepEqual(JSON.parse(requestInit.body), {
      endDate: "2026-09-10",
      startDate: "2026-09-08",
      taskIds: ["task-1"],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
