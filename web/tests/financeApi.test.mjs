import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

globalThis.window = { location: { hostname: "localhost", port: "5580", protocol: "http:", pathname: "/finance", search: "" } };
const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent", server: { middlewareMode: true } });
const api = await server.ssrLoadModule("/src/api/financeApi.ts");
const { FinancePage } = await server.ssrLoadModule("/src/pages/FinancePage.tsx");
const { FinanceWorkEditor } = await server.ssrLoadModule("/src/pages/FinanceWorkEditor.tsx");
const { FinanceCashModal, cashTargets } = await server.ssrLoadModule("/src/pages/FinanceCashModal.tsx");
const { FinanceCashHistory } = await server.ssrLoadModule("/src/pages/FinanceCashHistory.tsx");
const { cashAllocationLabel, cashRecordName } = await server.ssrLoadModule("/src/pages/financeCashLabels.ts");
after(() => server.close());

async function withFetch(response, operation) {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => { requests.push({ url: new URL(String(url)), init }); return typeof response === "function" ? response() : Response.json(response); };
  try { return await operation(requests); } finally { globalThis.fetch = previous; }
}
const totals = { officeCharge: 160000, officePay: 130000, extraCost: 5000, workProfit: 25000, directPay: 0 };
const assignment = { assignmentUuid: "assignment-1", workerProfileUuid: "worker-1", payeeKey: "worker-1", displayName: "김작업", assignmentStatus: "ASSIGNED", attendanceStatus: "WORKED", confirmed: true, actualStartAt: "2026-10-24T22:00:00Z", actualEndAt: "2026-10-25T08:00:00Z", breakMinutes: 60, workerCount: 1 };
const source = { scheduleDayUuid: "day-1", workDate: "2026-10-25", clientUuid: "client-1", clientProfileUuid: "profile-1", clientName: "박농가", siteUuid: "site-1", siteName: "마늘밭", workTitle: "마늘 작업", active: true, fingerprint: "source-v1", attendanceReady: true, assignments: [assignment] };
const work = { uuid: null, scheduleDayUuid: "day-1", version: 0, status: "UNPREPARED", sourceStatus: "READY", reviewRequired: false, currentSource: source, snapshot: null, totals, revisions: [] };

test("numeric API money becomes exact strings, missing stays null, counts stay numbers", () => {
  const parsed = api.parseFinanceJson('{"amount":999999999999,"workProfit":-25000,"payRate":null,"quantity":1.125,"version":2,"note":"amount: 9007199254740993"}');
  assert.deepEqual(parsed, { amount: "999999999999", workProfit: "-25000", payRate: null, quantity: 1.125, version: 2, note: "amount: 9007199254740993" });
  for (const amount of [1000000000000, 1.5, 9007199254740992]) assert.throws(() => api.parseFinanceJson(JSON.stringify({ amount })));
});

test("standard JSON serializer sends money as bounded numbers not quoted amounts", () => {
  const body = api.stringifyFinanceJson({ amount: "999999999999", allocations: [{ obligationUuid: "uuid", amount: "0" }], payRate: null, quantity: 1.125 });
  assert.deepEqual(JSON.parse(body), { amount: 999999999999, allocations: [{ obligationUuid: "uuid", amount: 0 }], payRate: null, quantity: 1.125 });
  for (const amount of ["1000000000000", "9007199254740993", "1.5", "", "1e3"]) assert.throws(() => api.stringifyFinanceJson({ amount }));
});

test("work query uses work dates and preserves authoritative office/direct profits", async () => {
  for (const direct of [false, true]) await withFetch({ items: [], summary: { ...totals, officeCharge: direct ? 30000 : 160000, officePay: direct ? 0 : 130000, directPay: direct ? 130000 : 0, confirmedCount: 1, unconfirmedCount: 2, reviewCount: 1, workerDayCount: 10, uniqueWorkerCount: 8, guestAttendanceCount: 2 } }, async requests => {
    const response = await api.fetchFinanceWork("office a", "2026-09-01", "2026-09-30");
    assert.equal(response.summary.workProfit, "25000");
    assert.equal(response.summary.directPay, direct ? "130000" : "0");
    assert.equal(response.summary.unconfirmedCount, 2);
    assert.equal(requests[0].url.pathname, "/api/finance/work");
    assert.equal(requests[0].url.searchParams.get("fromDate"), "2026-09-01");
    assert.equal(requests[0].url.searchParams.get("loginId"), "office a");
    assert.equal(requests[0].init.cache, "no-store");
  });
});

test("balances never acquire work/cash date filters and retain old outstanding", async () => {
  await withFetch({ items: [{ workDate: "2025-01-01", outstandingAmount: 350000, dueDate: null }], totalAmount: 650000, totalSettled: 300000, totalOutstanding: 350000 }, async requests => {
    const result = await api.fetchFinanceBalances("test", "PAYOUT");
    assert.equal(result.items[0].outstandingAmount, "350000");
    assert.deepEqual([...requests[0].url.searchParams.keys()].sort(), ["filter", "kind", "loginId"]);
    assert.equal(requests[0].url.searchParams.get("filter"), "ALL");
  });
});

test("cash lists filter actual cash dates, not work dates", async () => {
  await withFetch({ items: [] }, async requests => {
    await api.fetchFinanceCash("test", "RECEIPT", "2026-10-01", "2026-10-31");
    assert.equal(requests[0].url.pathname, "/api/finance/cash");
    assert.equal(requests[0].url.searchParams.get("fromDate"), "2026-10-01");
    assert.equal(requests[0].url.searchParams.get("toDate"), "2026-10-31");
    assert.equal(requests[0].url.searchParams.has("workDate"), false);
  });
});

test("reads never prepare work; explicit prepare has no fabricated body", async () => {
  await withFetch(work, async requests => {
    await api.fetchFinanceDetail("test", "work/1");
    await api.prepareFinanceWork("test", "day/1");
    assert.match(requests[0].url.pathname, /\/work\/work%2F1$/);
    assert.equal(requests[0].init.method, "GET");
    assert.match(requests[1].url.pathname, /\/day%2F1\/prepare$/);
    assert.equal(requests[1].init.method, "POST");
    assert.equal(requests[1].init.body, undefined);
  });
});

test("work save preserves version fingerprint null zero mode and explicit due dates", async () => {
  const payload = { version: 3, status: "CONFIRMED", reason: "근태 재확인", sourceFingerprint: "current-source", defaultMode: "DIRECT", defaultChargeRate: null, defaultPayRate: "0", receiptDueDate: null, lines: [{ assignmentUuid: "assignment-1", mode: "DIRECT", quantity: 1, chargeRate: "20000", payRate: "130000", chargeAmount: "20000", payAmount: "130000", override: true, payoutDueDate: "2026-11-02", note: "조퇴 금액 직접 확인" }], extras: [], note: null };
  await withFetch(work, async requests => {
    await api.saveFinanceWork("test", "work-1", payload);
    const body = JSON.parse(requests[0].init.body);
    assert.equal(body.defaultChargeRate, null);
    assert.equal(body.defaultPayRate, 0);
    assert.equal(body.lines[0].payAmount, 130000);
    assert.equal(body.lines[0].quantity, 1);
    assert.equal(body.lines[0].payoutDueDate, "2026-11-02");
    assert.equal(body.sourceFingerprint, "current-source");
    assert.equal(body.version, 3);
  });
});

test("create, cancel and atomic correction preserve request IDs and originals", async () => {
  const body = { kind: "PAYOUT", partyKey: "worker-1", cashDate: "2026-11-02", amount: "300000", method: "TRANSFER", memo: "농가 입금 대기와 별도로 지급", allocations: [{ obligationUuid: "obligation-1", amount: "300000" }] };
  await withFetch({ ...body, amount: 300000, allocations: [{ obligationUuid: "obligation-1", amount: 300000 }], uuid: "cash-1" }, async requests => {
    await api.createFinanceCash("test", "request-1", body);
    await api.cancelFinanceCash("test", "cash-1", "request-2", "오입력");
    await api.correctFinanceCash("test", "cash-1", "request-3", "금액 정정", body);
    assert.equal(JSON.parse(requests[0].init.body).requestId, "request-1");
    assert.deepEqual(JSON.parse(requests[1].init.body), { requestId: "request-2", reason: "오입력" });
    assert.deepEqual(JSON.parse(requests[2].init.body), { requestId: "request-3", reason: "금액 정정", replacement: { ...body, amount: 300000, allocations: [{ obligationUuid: "obligation-1", amount: 300000 }] } });
    assert.match(requests[2].url.pathname, /\/cash\/cash-1\/correct$/);
  });
});

test("settings persist office, worker and client presets without changing historical work", async () => {
  const settings = { version: 2, defaultMode: "OFFICE", defaultChargeRate: null, defaultPayRate: "0", payoutCycle: "WEEKLY", weeklyPayday: 1, customDueDate: null, workerOverrides: [{ workerProfileUuid: "worker-1", defaultMode: "DIRECT", chargeRate: "20000", payRate: "130000", payoutCycle: "CUSTOM", weeklyPayday: 3, customDueDate: "2026-11-04" }], clientOverrides: [{ clientProfileUuid: "profile-1", defaultMode: null, chargeRate: "150000", payRate: null }] };
  await withFetch({ ...settings, defaultPayRate: 0, workerOverrides: [], clientOverrides: [] }, async requests => {
    await api.saveFinanceSettings("test", settings, "다음 신규 초안부터 적용");
    const body = JSON.parse(requests[0].init.body);
    assert.equal(body.clientOverrides[0].clientProfileUuid, "profile-1");
    assert.equal(body.clientOverrides[0].chargeRate, 150000);
    assert.equal(body.workerOverrides[0].payoutCycle, "CUSTOM");
    assert.equal(body.weeklyPayday, 1);
    assert.equal(body.reason, "다음 신규 초안부터 적용");
    assert.equal(requests[0].url.pathname, "/api/finance/settings");
  });
});

test("safe API errors reach UI including concurrency and foreign-office rejection", async () => {
  for (const status of [400, 404, 409]) await withFetch(() => Response.json({ code: "FINANCE_ERROR", message: "다시 조회하고 확인하세요." }, { status }), async () => {
    await assert.rejects(() => api.fetchFinanceDetail("test", "foreign"), /다시 조회하고 확인하세요/);
  });
});

test("correction restores original allocations only within same party and kind", () => {
  const balances = [{ uuid: "a", kind: "PAYOUT", partyKey: "worker-1", workDate: "2026-10-25", partyName: "김작업", siteName: "마늘밭", outstandingAmount: "350000" }, { uuid: "b", kind: "PAYOUT", partyKey: "worker-2", outstandingAmount: "100000" }, { uuid: "c", kind: "DIRECT", partyKey: "worker-1", outstandingAmount: "100000" }];
  const result = cashTargets(balances, "PAYOUT", "worker-1", { cancelled: false, allocations: [{ obligationUuid: "a", amount: "300000" }, { obligationUuid: "old-paid", amount: "10000" }] });
  assert.equal(result.length, 2);
  assert.equal(result[0].balance, "650000");
  assert.equal(result[1].balance, "10000");
  assert.match(result[1].label, /기존 배분/);
});

test("page renders actual product tabs and no invented production data", () => {
  const markup = renderToStaticMarkup(React.createElement(FinancePage, { loginId: "test", onNavigate() {} }));
  for (const label of ["수익 현황", "농가 수납", "작업자 지급", "작업일 시작"]) assert.ok(markup.includes(label));
  assert.ok(!markup.includes("기본값·지급 주기"));
  assert.ok(!markup.includes("박농가"));
  assert.ok(!markup.includes("<table"));
});

test("work detail opens directly editable with actual hours and retains the grouped confirmation blocker", () => {
  const props = { loginId: "test", initialWork: work, onNavigate() {}, onClose() {}, onSaved() {} };
  const markup = renderToStaticMarkup(React.createElement(FinanceWorkEditor, props));
  assert.ok(markup.includes("김작업"));
  assert.ok(markup.includes("근태 확인"));
  assert.ok(!markup.includes("현재 실제 근태"));
  assert.ok(markup.includes("07:00"));
  assert.ok(markup.includes("<table"));
  assert.ok(!markup.includes("초안"));
  assert.match(markup, /aria-label="김작업 청구 금액 수정"/);
  for (const assignmentStatus of ["ASSIGNED", "CANCELLED", "REPLACED"]) {
    const grouped = { ...work, currentSource: { ...source, assignments: [{ ...assignment, assignmentStatus, attendanceStatus: "CANCELLED", workerCount: 3 }] } };
    const blocked = renderToStaticMarkup(React.createElement(FinanceWorkEditor, { ...props, initialWork: grouped }));
    assert.ok(blocked.includes("개인별 분리·근태 확인 필요"));
    assert.match(blocked, /disabled=""[^>]*>금액 확인·확정/);
  }
});

test("direct confirmation says it is neither office cash nor a transfer", () => {
  const markup = renderToStaticMarkup(React.createElement(FinanceCashModal, { loginId: "test", kind: "DIRECT", partyKey: "worker-1", partyName: "김작업", balances: [], onClose() {}, onSaved() {} }));
  assert.ok(markup.includes("사무소 입출금이나 은행 송금이 아닙니다"));
  assert.ok(markup.includes("배분 미리보기"));
});

test("DIRECT work uses office-fee labels and separates farm-to-worker payment from office cash", () => {
  for (const mode of ["OFFICE", "DIRECT"]) {
    const snapshot = { ...source, sourceFingerprint: source.fingerprint, defaultMode: mode, defaultChargeRate: "20000", defaultPayRate: "130000", receiptDueDate: source.workDate, lines: [{ ...assignment, mode, quantity: 1, chargeRate: "20000", payRate: "130000", chargeAmount: "20000", payAmount: "130000", override: false, payoutDueDate: source.workDate, note: null }], extras: [], note: null };
    const markup = renderToStaticMarkup(React.createElement(FinanceWorkEditor, { loginId: "test", initialWork: { ...work, uuid: "work-1", version: 1, status: "DRAFT", snapshot }, onNavigate() {}, onClose() {}, onSaved() {} }));
    if (mode === "DIRECT") {
      assert.ok(markup.includes("사무소에는 소개료만 청구"));
      assert.ok(markup.includes("농가 직접 지급"));
      assert.ok(markup.includes("사무소 비용·입출금에서 제외"));
      assert.ok(!markup.includes("<span>농가 청구 단가</span>"));
      assert.ok(markup.includes("청구 금액 수정"));
    } else {
      assert.ok(markup.includes("청구 금액 수정"));
      assert.ok(markup.includes("작업자 지급"));
      assert.ok(!markup.includes("농가 직접 지급 확인 대상액"));
    }
  }
});

const historicalCash = {
  uuid: "cash-historical", kind: "PAYOUT", partyKey: "old-worker-id", partyName: "김작업 · 당시 이름",
  cashDate: "2026-10-25", amount: "300000", method: "TRANSFER", memo: null,
  allocations: [{ obligationUuid: "old-fully-paid", amount: "300000", workDate: "2026-09-30", siteName: "당시 마늘밭", clientName: "당시 박농가" }],
  createdAt: "2026-10-25T00:00:00Z", createdByAccountUuid: "account-id", cancelled: false,
  cancellationReason: null, cancelledAt: null, replacesCashUuid: null,
};

test("cash reads retain read-only historical metadata after full settlement", async () => {
  await withFetch({ items: [{ ...historicalCash, amount: 300000, allocations: [{ ...historicalCash.allocations[0], amount: 300000 }] }] }, async () => {
    const result = await api.fetchFinanceCash("test", "PAYOUT", "2026-10-01", "2026-10-31");
    assert.deepEqual(result.items, [historicalCash]);
  });
});

test("fully paid cash history and correction render snapshot names without open balances", () => {
  const markup = renderToStaticMarkup(React.createElement(FinanceCashHistory, {
    records: [historicalCash], balances: [], nameForParty() { throw new Error("Snapshot name should take precedence"); }, correctionDisabled: false, onAction() {},
  }));
  for (const label of ["김작업 · 당시 이름", "2026-09-30", "당시 마늘밭", "당시 박농가", "300,000원"]) assert.ok(markup.includes(label));
  assert.ok(!markup.includes("old-fully-paid"));
  assert.ok(!markup.includes("old-worker-id"));
  const correction = renderToStaticMarkup(React.createElement(FinanceCashModal, {
    loginId: "test", kind: "PAYOUT", partyKey: historicalCash.partyKey, partyName: "fallback worker ID", balances: [], original: historicalCash, action: "correct", onClose() {}, onSaved() {},
  }));
  assert.ok(correction.includes("김작업 · 당시 이름"));
  assert.ok(correction.includes("2026-09-30 · 당시 마늘밭 · 당시 박농가"));
  const targets = cashTargets([], "PAYOUT", historicalCash.partyKey, historicalCash);
  assert.equal(targets[0].label, "2026-09-30 · 당시 마늘밭 · 당시 박농가");
  assert.equal(targets[0].balance, "300000");
});

test("historical labels win over renamed current records and legacy metadata retains fallbacks", () => {
  const current = { workDate: "2026-10-01", siteName: "새 현장명", clientName: "새 농가명" };
  assert.equal(cashAllocationLabel(historicalCash.allocations[0], current), "2026-09-30 · 당시 마늘밭 · 당시 박농가");
  assert.equal(cashAllocationLabel({ obligationUuid: "old", amount: "1" }, current), "2026-10-01 · 새 현장명 · 새 농가명");
  assert.equal(cashAllocationLabel({ obligationUuid: "old", amount: "1", workDate: null, siteName: "", clientName: null }), "기존 배분 · old");
  assert.equal(cashRecordName({ partyName: null, partyKey: "worker-id" }, () => "목록 이름"), "목록 이름");
  assert.equal(cashRecordName({ partyName: " ", partyKey: "worker-id" }, key => key), "worker-id");
  const cancelled = renderToStaticMarkup(React.createElement(FinanceCashHistory, { records: [{ ...historicalCash, cancelled: true, cancellationReason: "오입력 취소" }], balances: [], nameForParty: key => key, correctionDisabled: false, onAction() {} }));
  assert.ok(cancelled.includes("당시 마늘밭"));
  assert.ok(cancelled.includes("오입력 취소"));
  assert.ok(!cancelled.includes(">정정</button>"));
});

test("create and correction never send read-only cash or allocation metadata", async () => {
  await withFetch({ ...historicalCash, amount: 300000, allocations: [{ ...historicalCash.allocations[0], amount: 300000 }] }, async requests => {
    await api.createFinanceCash("test", "new-request", historicalCash);
    await api.correctFinanceCash("test", historicalCash.uuid, "correct-request", "금액 정정", historicalCash);
    const created = JSON.parse(requests[0].init.body);
    const corrected = JSON.parse(requests[1].init.body).replacement;
    for (const body of [created, corrected]) {
      assert.equal(body.partyName, undefined);
      assert.equal(body.uuid, undefined);
      assert.equal(body.createdAt, undefined);
      assert.deepEqual(body.allocations, [{ obligationUuid: "old-fully-paid", amount: 300000 }]);
    }
  });
});
