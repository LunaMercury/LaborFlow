import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent", server: { middlewareMode: true } });
const { orderedFinanceLines, payoutPlanChange, applyFinanceBulk, billingBreakdown, removeExtraSide } = await server.ssrLoadModule("/src/domain/financeWorkPresentation.ts");
const { FinanceWorkerAmountTable } = await server.ssrLoadModule("/src/pages/FinanceWorkerAmountTable.tsx");
const { financePreviewTotals } = await server.ssrLoadModule("/src/domain/financeWorkPreview.ts");
const { saveFinanceWork } = await server.ssrLoadModule("/src/api/financeApi.ts");
after(() => server.close());
globalThis.window = { location: { hostname: "localhost", port: "15580", protocol: "http:" }, localStorage: { getItem: () => null } };

const line = (id, name = id, more = {}) => ({ assignmentUuid: id, displayName: name, mode: "OFFICE", quantity: 1, chargeRate: "140000", chargeAmount: "140000", payRate: "120000", payAmount: "120000", override: false, payoutDueDate: "2026-10-26", note: null, ...more });
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : [];

test("name order groups identical names without merging assignments or changing edit targets", () => {
  const lines = [line("a", "서은주"), line("b", "네팔 3명"), line("c", "박민수"), line("d", "네팔 3명"), line("e", "권하늘")];
  const rows = orderedFinanceLines(lines, true);
  assert.deepEqual(rows.map(row => row.line.assignmentUuid), ["e", "b", "d", "c", "a"]);
  assert.deepEqual(rows.map(row => row.index), [4, 1, 3, 2, 0]);
  assert.deepEqual(lines.map(row => row.assignmentUuid), ["a", "b", "c", "d", "e"]);
  const calls = [];
  const tree = FinanceWorkerAmountTable({ lines, section: "payout", onChange: (...values) => calls.push(values) });
  nodes(tree).find(node => node.props.label === "권하늘 지급 금액 수정").props.onChange("125000");
  assert.deepEqual(calls, [[4, { payAmount: "125000" }]]);
});

test("billing half-day edit never changes worker pay and payout amount is a single primary input", () => {
  const calls = [];
  const tree = FinanceWorkerAmountTable({ lines: [line("one")], onChange: (...values) => calls.push(values) });
  nodes(tree).find(node => node.props.label === "one 청구 금액 수정").props.onChange("70000");
  assert.deepEqual(calls, [[0, { chargeAmount: "70000" }]]);
  const html = renderToStaticMarkup(React.createElement(FinanceWorkerAmountTable, { section: "payout", lines: [line("one")], onChange() {} }));
  assert.match(html, /지급 금액/);
  assert.match(html, /상세 메모 수정/);
  assert.doesNotMatch(html, /최종 농가 청구액/);
});

test("bulk edits respect group and explicit override choice and preserve the other amount side", () => {
  const lines = [line("m"), line("w"), line("exception", "예외", { override: true })];
  const source = { assignments: [{ assignmentUuid: "m", area: "MEN" }, { assignmentUuid: "w", area: "WOMEN" }] };
  const changed = applyFinanceBulk(lines, source, "MEN", false, () => ({ chargeRate: "70000", chargeAmount: "70000" }));
  assert.equal(changed[0].payAmount, "120000");
  assert.equal(changed[0].chargeAmount, "70000");
  assert.equal(changed[1], lines[1]);
  const without = applyFinanceBulk(lines, source, "ALL", false, () => ({ payRate: "130000", payAmount: "130000" }));
  assert.equal(without[2], lines[2]);
  const withOverrides = applyFinanceBulk(lines, source, "ALL", true, () => ({ payRate: "130000", payAmount: "130000" }));
  assert.equal(withOverrides[2].payAmount, "130000");
  assert.equal(withOverrides[2].chargeAmount, "140000");
});

test("payout plans distinguish seven days from weekly cycle and collection waiting preserves due date", () => {
  const before = line("one", "작업자", { payoutPlan: { method: "CASH", timing: "CUSTOM" } });
  assert.equal(payoutPlanChange(before, "2026-12-29", { timing: "AFTER_7_DAYS" }).payoutDueDate, "2027-01-05");
  assert.equal(payoutPlanChange(before, "2026-10-26", { timing: "SAME_DAY" }).payoutDueDate, "2026-10-26");
  const wait = payoutPlanChange(before, "2026-10-26", { timing: "AFTER_COLLECTION" });
  assert.equal(wait.payoutDueDate, before.payoutDueDate);
  assert.equal(wait.payoutPlan.method, "CASH");
  assert.equal(payoutPlanChange(before, "2026-10-26", { method: "TRANSFER" }).payoutPlan.timing, "CUSTOM");
});

test("billing statement reproduces 2600000 example without adding worker payments", () => {
  const lines = Array.from({ length: 16 }, (_, i) => line(String(i)));
  const extras = [["남자 일당 추가", "20000", 2], ["참값", "10000", 16], ["보너스", "10000", 16]].map(([name, rate, quantity], i) => ({ uuid: String(i), name, basis: "PER_PERSON", quantity, chargeRate: rate, chargeAmount: String(Number(rate) * quantity), costRate: "0", costAmount: "0" }));
  const breakdown = billingBreakdown(lines, extras);
  assert.deepEqual(breakdown.map(row => row.amount), ["2240000", "40000", "160000", "160000"]);
  assert.equal(financePreviewTotals(lines, extras).officeCharge, "2600000");
  assert.equal(financePreviewTotals(lines, extras).officePay, "1920000");
  assert.equal(breakdown[0].quantity, 16);
});

test("removing additional billing never deletes linked office cost and vice versa", () => {
  const extra = { uuid: "extra", chargeRate: "10000", chargeAmount: "10000", costRate: "5000", costAmount: "5000" };
  assert.deepEqual(removeExtraSide([extra], "extra", "billing"), [{ ...extra, chargeRate: "0", chargeAmount: "0" }]);
  assert.deepEqual(removeExtraSide([extra], "extra", "payout"), [{ ...extra, costRate: "0", costAmount: "0" }]);
  assert.deepEqual(removeExtraSide([{ ...extra, costAmount: "0" }], "extra", "billing"), []);
});

test("planned payment information is serialized on work save, not as an actual cash write", async () => {
  const originalFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return new Response('{}'); };
  try {
    await saveFinanceWork("fiction", "work", { lines: [line("one", "작업자", { payoutPlan: { method: "TRANSFER", timing: "AFTER_COLLECTION" } })] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, "PUT");
    assert.match(calls[0].url, /\/finance\/work\/work\?/);
    assert.deepEqual(JSON.parse(calls[0].options.body).lines[0].payoutPlan, { method: "TRANSFER", timing: "AFTER_COLLECTION" });
  } finally { globalThis.fetch = originalFetch; }
});
