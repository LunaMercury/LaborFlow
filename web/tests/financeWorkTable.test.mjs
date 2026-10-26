import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createServer } from "vite";

globalThis.window = { location: { hostname: "localhost", port: "15580", protocol: "http:", search: "" }, localStorage: { getItem: () => null }, confirm: () => true };
const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent", server: { middlewareMode: true } });
const preview = await server.ssrLoadModule("/src/domain/financeWorkPreview.ts");
const finance = await server.ssrLoadModule("/src/domain/finance.ts");
const rates = await server.ssrLoadModule("/src/domain/scheduleFinanceRates.ts");
const presentation = await server.ssrLoadModule("/src/domain/financeWorkPresentation.ts");
const dateHelpers = await server.ssrLoadModule("/src/components/dateNavigationHelpers.ts");
const { FinanceWorkerAmountTable } = await server.ssrLoadModule("/src/pages/FinanceWorkerAmountTable.tsx");
const { FinanceWorkEditor } = await server.ssrLoadModule("/src/pages/FinanceWorkEditor.tsx");
after(() => server.close());

const assignment = (id, area, more = {}) => ({ assignmentUuid: id, workerProfileUuid: id, displayName: `가상 ${id}`, payeeKey: id, area, assignmentStatus: "WORKED", attendanceStatus: "WORKED", confirmed: true, workerCount: 1, actualStartAt: null, actualEndAt: null, breakMinutes: 60, ...more });
const source = { scheduleDayUuid: "day", clientUuid: "client", clientProfileUuid: "profile", clientName: "가상 농가", siteUuid: "site", siteName: "가상 현장", workTitle: "가상 수확", workDate: "2026-10-25", active: true, fingerprint: "fiction", attendanceReady: true, maleChargeRate: "160000", femaleChargeRate: "140000", assignments: [assignment("m", "MEN"), assignment("w", "WOMEN")] };
const line = (id, values = {}) => ({ ...assignment(id, "MEN"), mode: "OFFICE", quantity: 1, chargeRate: "160000", chargeAmount: "160000", payRate: "130000", payAmount: "130000", override: false, payoutDueDate: null, note: null, ...values });
const snapshot = { ...source, sourceFingerprint: source.fingerprint, defaultMode: "OFFICE", defaultChargeRate: null, defaultPayRate: null, receiptDueDate: null, lines: [line("m"), line("w", { chargeRate: "140000", chargeAmount: "140000", payRate: "110000", payAmount: "110000" })], extras: [], note: null };
const work = { uuid: "work", scheduleDayUuid: "day", version: 3, status: "DRAFT", sourceStatus: "READY", reviewRequired: false, currentSource: source, snapshot, revisions: [], totals: { officeCharge: "300000", officePay: "240000", extraCost: "0", workProfit: "60000", directPay: "0" } };

test("opening preview includes only individually confirmed work and never invents wages", () => {
  const rows = preview.schedulePreviewLines({ ...source, assignments: [...source.assignments, assignment("draft", "MEN", { confirmed: false }), assignment("absent", "MEN", { attendanceStatus: "ABSENT" }), assignment("group", "WOMEN", { workerCount: 2 })] });
  assert.deepEqual(rows.map(row => row.assignmentUuid), ["m", "w"]);
  assert.deepEqual(rows.map(row => row.chargeAmount), ["160000", "140000"]);
  assert.deepEqual(rows.map(row => row.payAmount), [null, null]);
  assert.deepEqual(preview.financePreviewTotals(rows, []), { officeCharge: "300000", officePay: null, extraCost: "0", workProfit: null, directPay: "0" });
});

test("automatic draft fill preserves explicit zero, overrides, confirmed values and original objects", () => {
  const empty = line("m", { chargeRate: null, chargeAmount: null });
  const original = { ...work, snapshot: { ...snapshot, lines: [empty, line("w", { chargeRate: "0", chargeAmount: "0" }), { ...empty, override: true }, { ...empty, mode: "DIRECT" }] } };
  const filled = preview.editableFinanceSnapshot(original);
  assert.deepEqual(filled.lines.map(row => row.chargeAmount), ["160000", "0", null, null]);
  assert.equal(filled.lines[0].payAmount, "130000");
  assert.equal(empty.chargeAmount, null);
  assert.equal(preview.editableFinanceSnapshot({ ...original, status: "CONFIRMED" }), original.snapshot);
});

test("live totals match hand-calculated billing, direct fees, extras and manual amounts", () => {
  const lines = [line("m", { quantity: 2, chargeRate: "150000", chargeAmount: null, payRate: "130000", payAmount: null }), line("w", { mode: "DIRECT", chargeAmount: "20000", payAmount: "140000" })];
  const extras = [{ quantity: 2, chargeRate: "10000", chargeAmount: null, costRate: "5000", costAmount: null }];
  assert.deepEqual(preview.financePreviewTotals(lines, extras), { officeCharge: "340000", officePay: "260000", extraCost: "10000", workProfit: "70000", directPay: "140000" });
  assert.equal(preview.financePreviewTotals([line("m", { chargeRate: "999999999999", chargeAmount: "0", payAmount: "0" })], []).workProfit, "0");
  assert.equal(preview.financePreviewTotals([line("m", { quantity: 0.5, chargeRate: "101", chargeAmount: null, payAmount: "0" })], []).officeCharge, "51");
});

test("missing cost prevents false profit and large integer totals stay exact", () => {
  assert.equal(preview.financePreviewTotals([line("m")], [{ quantity: 1, chargeRate: "0", chargeAmount: null, costRate: null, costAmount: null }]).workProfit, null);
  const rows = Array.from({ length: 10000 }, (_, i) => line(String(i), { chargeAmount: "999999999999", payAmount: "0" }));
  assert.equal(preview.financePreviewTotals(rows, []).officeCharge, "9999999999990000");
});

const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : [];
test("table exposes final charge and memo edits without changing wages or rate history", () => {
  const changes = [];
  const tree = FinanceWorkerAmountTable({ lines: [line("m")], onChange: (...args) => changes.push(args) });
  nodes(tree).find(node => node.props.label === "가상 m 청구 금액 수정").props.onChange("120000");
  nodes(tree).find(node => node.props.label === "가상 m 상세 메모 수정").props.onChange("오전일만");
  assert.deepEqual(changes, [[0, { chargeAmount: "120000" }], [0, { note: "오전일만" }]]);
});

test("work popup shows table, live totals and optional settings without duplicated attendance detail", () => {
  const html = renderToStaticMarkup(React.createElement(FinanceWorkEditor, { loginId: "fiction", initialWork: work, onClose() {}, onSaved() {}, onNavigate() {} }));
  assert.match(html, /<table/);
  assert.match(html, /입력 중 금액 합계/);
  assert.match(html, /60,000원/);
  assert.match(html, /근태 확인/);
  assert.doesNotMatch(html, /현재 실제 근태/);
  assert.match(html, /청구금액 일괄입력/);
  assert.match(html, /농가 청구 명단/);
  assert.match(html, /청구 합계/);
  assert.match(html, /공통 기본값·지급 주기 \(선택\)/);
});

function mountFinanceComponent(file, exported, props, api = {}) {
  const values = []; let cursor = 0;
  const hooks = { useState(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial; return [values[slot], value => { values[slot] = typeof value === "function" ? value(values[slot]) : value; }]; }, useRef(initial) { const slot = cursor++; return values[slot] ??= { current: initial }; } };
  const nativeRequire = createRequire(import.meta.url);
  const code = ts.transpileModule(readFileSync(new URL(`../src/pages/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, window, Error, require(name) {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return nativeRequire(name);
    if (name.endsWith("/financeApi")) return api;
    if (name.endsWith("/financeWorkPreview")) return preview;
    if (name.endsWith("/scheduleFinanceRates")) return rates;
    if (name.endsWith("/financeWorkPresentation")) return presentation;
    if (name.endsWith("/dateNavigationHelpers")) return dateHelpers;
    if (name.endsWith("/finance")) return finance;
    if (name.endsWith("/useUnsavedChangesGuard")) return { useUnsavedChangesGuard: dirty => { api.onDirty?.(dirty); return () => true; } };
    if (name.endsWith(".css")) return { default: new Proxy({}, { get: (_, key) => key }) };
    return new Proxy({}, { get: (_, key) => String(key) });
  } });
  return () => { cursor = 0; return mod.exports[exported](props); };
}

function mountEditor(initialWork, api) {
  return mountFinanceComponent("FinanceWorkEditor.tsx", "FinanceWorkEditor", { loginId: "fiction", initialWork, onClose() {}, onSaved() {}, onNavigate() {} }, api);
}

test("opening does not write; failed save preserves edited values and retry sends the same draft once", async () => {
  const calls = []; let fail = true;
  const render = mountEditor(work, { async saveFinanceWork(...args) { calls.push(args); if (fail) throw new Error("fiction save failure"); return { ...work, snapshot: { ...snapshot, lines: snapshot.lines.map((line, i) => i === 0 ? { ...line, chargeRate: "175000", chargeAmount: "175000", override: true } : line) } }; } });
  let tree = render();
  assert.equal(calls.length, 0);
  nodes(tree).find(node => node.type === "FinanceWorkerAmountTable").props.onChange(0, { chargeRate: "175000", chargeAmount: "175000" });
  tree = render();
  const save = nodes(tree).find(node => node.type === "button" && node.props.children === "저장");
  save.props.onClick(); save.props.onClick();
  await new Promise(setImmediate);
  assert.equal(calls.length, 1);
  tree = render();
  assert.equal(nodes(tree).find(node => node.type === "FinanceWorkerAmountTable").props.lines[0].chargeAmount, "175000");
  assert.ok(nodes(tree).some(node => node.props.role === "alert" && node.props.children === "fiction save failure"));
  fail = false;
  nodes(tree).find(node => node.type === "button" && node.props.children === "저장").props.onClick();
  await new Promise(setImmediate);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][2].lines[0].chargeAmount, "175000");
  assert.equal(calls[1][2].version, 3);
});

test("new work is immediately editable without a write or dirty prompt; first save initializes internally once", async () => {
  const calls = []; const dirty = [];
  const server = { ...work, version: 1 };
  let fail = true;
  const render = mountEditor({ ...work, uuid: null, status: "UNPREPARED", snapshot: null }, {
    onDirty: value => dirty.push(value),
    async prepareFinanceWork() { calls.push("prepare"); return server; },
    async saveFinanceWork(login, uuid, payload) { calls.push({ uuid, payload }); if (fail) throw new Error("fiction retry"); return { ...server, version: 2, snapshot: { ...snapshot, lines: snapshot.lines.map((row, index) => ({ ...row, ...payload.lines[index] })) } }; },
  });
  let tree = render();
  assert.equal(calls.length, 0);
  assert.equal(dirty.at(-1), false);
  assert.equal(nodes(tree).find(node => node.type === "FinanceWorkerAmountTable").props.readOnly, false);
  nodes(tree).find(node => node.type === "FinanceWorkerAmountTable").props.onChange(0, { chargeAmount: "120000", note: "오전일만" });
  tree = render();
  const save = nodes(tree).find(node => node.type === "button" && node.props.children === "저장");
  save.props.onClick(); save.props.onClick();
  await new Promise(setImmediate);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], "prepare");
  assert.equal(calls[1].payload.lines[0].chargeAmount, "120000");
  assert.equal(calls[1].payload.lines[0].payAmount, "130000");
  tree = render();
  assert.equal(nodes(tree).find(node => node.type === "FinanceWorkerAmountTable").props.lines[0].note, "오전일만");
  fail = false;
  nodes(tree).find(node => node.type === "button" && node.props.children === "저장").props.onClick();
  await new Promise(setImmediate);
  assert.equal(calls.filter(call => call === "prepare").length, 1);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].payload.lines[0].chargeAmount, "120000");
});

test("first save never overwrites a concurrently saved or confirmed record", async () => {
  for (const server of [{ ...work, version: 2 }, { ...work, status: "CONFIRMED", version: 1 }]) {
    let writes = 0;
    const render = mountEditor({ ...work, uuid: null, status: "UNPREPARED", snapshot: null }, { async prepareFinanceWork() { return server; }, async saveFinanceWork() { writes++; return server; } });
    let tree = render();
    nodes(tree).find(node => node.type === "FinanceWorkerAmountTable").props.onChange(0, { chargeAmount: "120000" });
    tree = render();
    nodes(tree).find(node => node.type === "button" && node.props.children === "저장").props.onClick();
    await new Promise(setImmediate);
    assert.equal(writes, 0);
    tree = render();
    assert.equal(nodes(tree).find(node => node.type === "FinanceWorkerAmountTable").props.lines[0].chargeAmount, "120000");
    assert.ok(nodes(tree).some(node => node.props.role === "alert"));
  }
});

test("inline money edits commit once on Enter or blur and Escape preserves the original value", () => {
  const calls = [];
  const render = mountFinanceComponent("FinanceEditableCell.tsx", "FinanceEditableMoneyCell", { label: "가상 청구 금액", value: "120000", onChange: value => calls.push(value) });
  assert.equal(render().props.children, "120,000");
  render().props.onClick();
  let input = render();
  input.props.onChange({ target: { value: "60,000" } });
  input = render();
  assert.equal(input.props.value, "60000");
  input.props.onKeyDown({ key: "Enter", preventDefault() {} });
  input.props.onBlur();
  assert.deepEqual(calls, ["60000"]);
  render().props.onClick();
  input = render(); input.props.onChange({ target: { value: "999" } }); input = render();
  input.props.onKeyDown({ key: "Escape", stopPropagation() {}, preventDefault() {} });
  input.props.onBlur();
  assert.deepEqual(calls, ["60000"]);
});

test("memo click supports Korean multiline input, cancel, and keyboard commit", () => {
  const calls = [];
  const render = mountFinanceComponent("FinanceEditableCell.tsx", "FinanceEditableMemoCell", { label: "가상 메모", value: null, onChange: value => calls.push(value) });
  render().props.onClick();
  let input = render(); input.props.onChange({ target: { value: "오전일만\n현장 확인" } }); input = render();
  input.props.onKeyDown({ key: "Enter", ctrlKey: false, metaKey: false });
  assert.equal(calls.length, 0);
  input.props.onKeyDown({ key: "Enter", ctrlKey: true, preventDefault() {} });
  input.props.onBlur();
  assert.deepEqual(calls, ["오전일만\n현장 확인"]);
});

test("column bulk popup applies only the selected amount and cancel does not modify rows", () => {
  const changes = []; let closed = 0;
  const lines = [line("m", { override: true }), line("w")];
  const render = mountFinanceComponent("FinanceBulkAmountEditor.tsx", "FinanceBulkAmountEditor", { field: "pay", lines, source, workDate: source.workDate, onChange: rows => changes.push(rows), onClose() { closed++; } });
  let tree = render();
  assert.equal(tree.props.title, "지급금액 일괄입력");
  assert.equal(nodes(tree).find(node => node.type === "MoneyInput").props.formatThousands, true);
  nodes(tree).find(node => node.type === "MoneyInput").props.onChange("125000");
  tree = render();
  nodes(tree).find(node => node.type === "button" && node.props.children === "일괄입력").props.onClick();
  assert.equal(changes.length, 1); assert.equal(closed, 1);
  assert.deepEqual(changes[0].map(row => row.payAmount), ["125000", "125000"]);
  assert.deepEqual(changes[0].map(row => row.chargeAmount), ["160000", "160000"]);
  assert.equal(changes[0][0].payRate, "130000");
  const cancelled = mountFinanceComponent("FinanceBulkAmountEditor.tsx", "FinanceBulkAmountEditor", { field: "charge", lines, source, workDate: source.workDate, onChange: rows => changes.push(rows), onClose() { closed++; } });
  nodes(cancelled()).find(node => node.type === "button" && node.props.children === "닫기").props.onClick();
  assert.equal(changes.length, 1);
});

test("bulk money input formats thousands while preserving raw amounts, zero and empty values", () => {
  const calls = [];
  const props = { label: "지급금액", value: null, formatThousands: true, onChange(value) { calls.push(value); props.value = value; } };
  const render = mountFinanceComponent("financeControls.tsx", "MoneyInput", props);
  const input = () => nodes(render()).find(node => node.type === "input");
  assert.equal(input().props.value, "");
  input().props.onChange({ target: { value: "140000" } });
  assert.equal(input().props.value, "140,000");
  input().props.onChange({ target: { value: "1,400,000" } });
  assert.equal(input().props.value, "1,400,000");
  assert.equal(calls.at(-1), "1400000");
  input().props.onChange({ target: { value: "140원" } });
  assert.equal(calls.length, 2);
  input().props.onChange({ target: { value: "0" } });
  assert.equal(input().props.value, "0");
  input().props.onChange({ target: { value: "" } });
  assert.equal(props.value, null);
  props.formatThousands = false;
  props.value = "140000";
  assert.equal(input().props.value, "140000");
  input().props.onChange({ target: { value: "140,000" } });
  assert.equal(calls.length, 4);
});

test("bulk column opens a separate modal and keeps the underlying work inactive until closed", () => {
  const render = mountEditor(work, {});
  let tree = render();
  nodes(tree).find(node => node.type === "FinanceWorkerAmountTable").props.onBulk("method");
  tree = render();
  const modal = nodes(tree).find(node => node.type === "FinanceBulkAmountEditor");
  assert.equal(modal.props.field, "method");
  assert.equal(nodes(tree).find(node => node.type === "HistoryDialog").props.inactive, true);
  modal.props.onClose();
  tree = render();
  assert.equal(nodes(tree).some(node => node.type === "FinanceBulkAmountEditor"), false);
});

test("method and due-date bulk modals preserve other columns and keep collection waiting independent", () => {
  const lines = [line("m", { payoutPlan: { method: "CASH", timing: "AFTER_COLLECTION" }, note: "메모 유지" })];
  const methodChanges = [];
  const method = mountFinanceComponent("FinanceBulkAmountEditor.tsx", "FinanceBulkAmountEditor", { field: "method", lines, source, workDate: source.workDate, onChange: rows => methodChanges.push(rows), onClose() {} });
  nodes(method()).find(node => node.type === "FinancePayoutPlanInput").props.onChange({ method: "TRANSFER" });
  nodes(method()).find(node => node.type === "button" && node.props.children === "일괄입력").props.onClick();
  assert.equal(methodChanges[0][0].payoutPlan.method, "TRANSFER");
  assert.equal(methodChanges[0][0].payoutPlan.timing, "AFTER_COLLECTION");
  assert.equal(methodChanges[0][0].payAmount, "130000");
  assert.equal(methodChanges[0][0].note, "메모 유지");
  const dueChanges = [];
  const due = mountFinanceComponent("FinanceBulkAmountEditor.tsx", "FinanceBulkAmountEditor", { field: "due", lines, source, workDate: source.workDate, onChange: rows => dueChanges.push(rows), onClose() {} });
  nodes(due()).find(node => node.type === "FinancePayoutPlanInput").props.onChange({ timing: "AFTER_7_DAYS" });
  nodes(due()).find(node => node.type === "button" && node.props.children === "일괄입력").props.onClick();
  assert.equal(dueChanges[0][0].payoutDueDate, "2026-11-01");
  assert.equal(dueChanges[0][0].payoutPlan.method, "CASH");
  assert.equal(dueChanges[0][0].chargeAmount, "160000");
});

test("changed source detected during first save preserves local input and never submits stale amounts", async () => {
  let writes = 0;
  const render = mountEditor({ ...work, uuid: null, status: "UNPREPARED", snapshot: null }, {
    async prepareFinanceWork() { return { ...work, version: 1, snapshot: { ...snapshot, sourceFingerprint: "changed" } }; },
    async saveFinanceWork() { writes++; return work; },
  });
  let tree = render();
  nodes(tree).find(node => node.type === "FinanceWorkerAmountTable").props.onChange(0, { chargeAmount: "120000" });
  tree = render(); nodes(tree).find(node => node.type === "button" && node.props.children === "저장").props.onClick();
  await new Promise(setImmediate);
  assert.equal(writes, 0);
  tree = render();
  assert.equal(nodes(tree).find(node => node.type === "FinanceWorkerAmountTable").props.lines[0].chargeAmount, "120000");
  assert.ok(nodes(tree).some(node => node.props.role === "alert"));
});
