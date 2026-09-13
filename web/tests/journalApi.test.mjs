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
  createSalesJournal,
  deleteWorkJournal,
  fetchSalesJournals,
  fetchWorkJournal,
  saveWorkJournal,
} = await server.ssrLoadModule("/src/api/journalApi.ts");
const { SalesJournalPage } = await server.ssrLoadModule("/src/pages/SalesJournalPage.tsx");
const { WorkJournalPage } = await server.ssrLoadModule("/src/pages/WorkJournalPage.tsx");

after(async () => {
  await server.close();
});

test("sales journal list preserves date and body search parameters", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit;
  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url);
    requestInit = init;
    return Response.json([]);
  };

  try {
    const result = await fetchSalesJournals("test", {
      fromDate: "2026-09-01",
      toDate: "2026-09-30",
      query: "마늘",
    });
    const url = new URL(requestedUrl);

    assert.deepEqual(result, []);
    assert.equal(url.pathname, "/api/journals/sales");
    assert.equal(url.searchParams.get("loginId"), "test");
    assert.equal(url.searchParams.get("fromDate"), "2026-09-01");
    assert.equal(url.searchParams.get("toDate"), "2026-09-30");
    assert.equal(url.searchParams.get("query"), "마늘");
    assert.deepEqual(requestInit, { cache: "no-store" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sales journal create preserves multiline Korean content", async () => {
  const originalFetch = globalThis.fetch;
  let requestInit;
  globalThis.fetch = async (_url, init) => {
    requestInit = init;
    return Response.json({
      uuid: "11111111-1111-4111-8111-111111111111",
      activityAt: "2026-09-11T14:30:00+09:00",
      content: "구지 방면\n고추 작업 종료",
      createdAt: "2026-09-11T14:31:00+09:00",
      updatedAt: "2026-09-11T14:31:00+09:00",
    });
  };

  try {
    const result = await createSalesJournal("test", {
      activityAt: "2026-09-11T14:30",
      content: "구지 방면\n고추 작업 종료",
    });

    assert.equal(requestInit.method, "POST");
    assert.deepEqual(JSON.parse(requestInit.body), {
      activityAt: "2026-09-11T14:30",
      content: "구지 방면\n고추 작업 종료",
    });
    assert.equal(result.content, "구지 방면\n고추 작업 종료");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("opening a work journal performs only a no-store read", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit;
  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url);
    requestInit = init;
    return Response.json({
      journalUuid: null,
      scheduleDayUuid: "22222222-2222-4222-8222-222222222222",
      workDate: "2026-09-11",
      ownerName: "가상 거래처",
      siteName: "가상 현장",
      address: "가상 주소",
      workTitle: "마늘 심기",
      memo: "",
      createdAt: null,
      updatedAt: null,
      actualWorkerCount: 0,
      attendance: [],
    });
  };

  try {
    const result = await fetchWorkJournal(
      "test",
      "22222222-2222-4222-8222-222222222222",
    );
    const url = new URL(requestedUrl);

    assert.equal(url.pathname, "/api/journals/work/22222222-2222-4222-8222-222222222222");
    assert.deepEqual(requestInit, { cache: "no-store" });
    assert.equal(result.journalUuid, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("work memo save and bodyless delete keep their separate contracts", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    if (init?.method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    return Response.json({
      journalUuid: "33333333-3333-4333-8333-333333333333",
      scheduleDayUuid: "22222222-2222-4222-8222-222222222222",
      workDate: "2026-09-11",
      ownerName: "가상 거래처",
      siteName: "가상 현장",
      address: "가상 주소",
      workTitle: "마늘 심기",
      memo: "진행 내용\n남은 작업",
      createdAt: "2026-09-11T18:00:00+09:00",
      updatedAt: "2026-09-11T18:00:00+09:00",
      actualWorkerCount: 1,
      attendance: [],
    });
  };

  try {
    await saveWorkJournal(
      "test",
      "22222222-2222-4222-8222-222222222222",
      "진행 내용\n남은 작업",
    );
    await deleteWorkJournal("test", "22222222-2222-4222-8222-222222222222");

    assert.equal(requests[0].init.method, "PUT");
    assert.deepEqual(JSON.parse(requests[0].init.body), { memo: "진행 내용\n남은 작업" });
    assert.equal(requests[1].init.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("journal errors preserve the server message and fallback behavior", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ message: "가상 오류" }, { status: 400 });

  try {
    await assert.rejects(
      fetchWorkJournal("test", "22222222-2222-4222-8222-222222222222"),
      new Error("가상 오류"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("both journal pages expose independent mobile-accessible entry controls", () => {
  const salesMarkup = renderToStaticMarkup(
    React.createElement(SalesJournalPage, { loginId: "test" }),
  );
  const workMarkup = renderToStaticMarkup(
    React.createElement(WorkJournalPage, {
      loginId: "test",
      onNavigate: () => undefined,
    }),
  );

  assert.match(salesMarkup, /id="sales-journal-title"/);
  assert.match(salesMarkup, />새 일지</);
  assert.match(salesMarkup, /type="search"/);
  assert.match(workMarkup, /id="work-journal-title"/);
  assert.match(workMarkup, />작업일지 작성</);
  assert.match(workMarkup, />일정으로 돌아가기</);
  assert.match(workMarkup, /거래처 검색/);
});
