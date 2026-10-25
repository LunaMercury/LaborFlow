import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import * as jsxRuntime from "react/jsx-runtime";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createServer } from "vite";

const originalWindow = globalThis.window;
globalThis.window = {
  location: { hostname: "localhost", port: "5580", protocol: "http:", search: "?month=2026-10" },
  matchMedia: () => ({ matches: false }),
  alert: message => { throw new Error(message); },
};
const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent", esbuild: { jsx: "automatic" }, server: { middlewareMode: true } });
const money = await server.ssrLoadModule("/src/components/IntegerMoneyInput.tsx");
const api = await server.ssrLoadModule("/src/api/scheduleApi.ts");
const cssModules = {
  "../App.module.css": await server.ssrLoadModule("/src/App.module.css"),
  "./ScheduleCalendarPage.module.css": await server.ssrLoadModule("/src/pages/ScheduleCalendarPage.module.css"),
};
after(async () => { globalThis.window = originalWindow; await server.close(); });

const pageSource = readFileSync(new URL("../src/pages/ScheduleCalendarPage.tsx", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile("ScheduleCalendarPage.tsx", pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const pageDeclaration = sourceFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ScheduleCalendarPage");
const pageReturn = pageDeclaration.body.statements.find(ts.isReturnStatement);
// Keep the real JSX and handlers, exposing local state only inside this test build.
const exposedPage = pageSource.slice(0, pageReturn.getStart(sourceFile))
  + `return { tree: ${pageReturn.expression.getText(sourceFile)}, createDraft, setCreateDraft, editDraft, setEditDraft,
    events, setEvents, openCreateModal, openEditModal, submitCreateSchedule, submitEditSchedule, createAdjustedEvent, editFormRef };`
  + pageSource.slice(pageReturn.end)
  + "\nexport { createEmptyScheduleDraft, createEditScheduleDraft, taskToEvent, groupTasksIntoEvents };";

function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
}
const compiledPage = compile(exposedPage);

function mountCalendar() {
  const slots = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo: factory => factory(),
    useEffect() {},
  };
  const calls = [];
  const exports = {};
  new Function("require", "exports", compiledPage)(path => {
    if (path === "react") return hooks;
    if (path === "react/jsx-runtime") return jsxRuntime;
    if (path.endsWith(".module.css")) return { __esModule: true, default: cssModules[path].default };
    if (path === "../components/IntegerMoneyInput") return money;
    if (path === "../hooks/useUnsavedChangesGuard") return { useUnsavedChangesGuard: () => () => true };
    if (path === "../api/scheduleApi") return {
      fetchFarmOwners: async () => [],
      createScheduleTask: async (...args) => { calls.push({ operation: "create", args }); return {}; },
      updateScheduleTaskRange: async (...args) => { calls.push({ operation: "edit", args }); },
    };
    throw new Error(`Unexpected dependency ${path}`);
  }, exports);
  return {
    exports, calls,
    render() { cursor = 0; return exports.ScheduleCalendarPage({ loginId: "test", onNavigate() {} }); },
  };
}

function task(date, chargeRates = { male: 140000, female: 130000 }, extra = {}) {
  return {
    date, chargeRates, id: `day-${date}`, workSiteId: "site", ownerUuid: "owner", ownerName: "농가",
    address: "농장 주소", clientWorkSiteUuid: "client-site", assignments: [{ area: "men", workerCount: 1 }],
    startTime: "07:00", endTime: "17:00", timeRange: "07:00 - 17:00", title: "수확", siteName: "밭",
    memo: "일정 메모", siteMemo: "현장 메모", requiredMen: 2, requiredWomen: 3, workTypeCodes: ["harvest"], ...extra,
  };
}

test("integer money formats live and distinguishes missing from zero", () => {
  for (const [input, value, display] of [["", null, ""], ["0", 0, "0"], ["0000", 0, "0"], ["140000", 140000, "140,000"], ["140,000", 140000, "140,000"], ["999999999999", 999999999999, "999,999,999,999"]]) {
    assert.equal(money.parseIntegerMoneyInput(input), value);
    assert.equal(money.formatIntegerMoneyInput(value), display);
  }
  for (const input of ["1000000000000", "9007199254740993", "-1", "1.5", "1e3", "Infinity", "NaN", "abc", "14만원", ",", " "]) {
    assert.equal(money.parseIntegerMoneyInput(input), undefined, input);
  }
});

test("money input uses text/numeric and its change handler rejects invalid amounts", () => {
  const source = readFileSync(new URL("../src/components/IntegerMoneyInput.tsx", import.meta.url), "utf8");
  const exports = {};
  new Function("require", "exports", compile(source))(path => path === "react"
    ? { useRef: value => ({ current: value }), useLayoutEffect() {} } : jsxRuntime, exports);
  let value = null;
  const render = () => exports.IntegerMoneyInput({ value, onChange: next => { value = next; } });
  assert.equal(render().props.type, "text");
  assert.equal(render().props.inputMode, "numeric");
  for (const [input, expected] of [["140000", 140000], ["140,0000", 1400000], ["-1", 1400000], ["1000000000000", 1400000], ["", null], ["0", 0]]) {
    render().props.onChange({ currentTarget: { value: input, selectionStart: input.length } });
    assert.equal(value, expected);
    assert.equal(render().props.value, money.formatIntegerMoneyInput(expected));
  }
  const html = renderToStaticMarkup(createElement(money.IntegerMoneyInput, { value: 140000, onChange() {} }));
  assert.match(html, /value="140,000"/);
});

test("multi-day grouping splits differing rates and missing versus zero", () => {
  const { groupTasksIntoEvents } = mountCalendar().exports;
  const grouped = groupTasksIntoEvents([
    task("2026-10-01"), task("2026-10-02"),
    task("2026-10-03", { male: 150000, female: 130000 }),
    task("2026-10-04", { male: 150000, female: 0 }),
    task("2026-10-05", { male: 150000, female: null }),
  ]);
  assert.equal(grouped.length, 4);
  assert.deepEqual(grouped[0].taskIds, ["day-2026-10-01", "day-2026-10-02"]);
  assert.equal(groupTasksIntoEvents([task("2026-10-01", undefined), task("2026-10-02", { male: null, female: null })]).length, 2);
  // A truly legacy response without rates groups with explicit missing values.
  assert.equal(groupTasksIntoEvents([task("2026-10-01", null), task("2026-10-02", { male: null, female: null })]).length, 1);
});

test("draft initialization keeps null/zero and does not alias the event rates", () => {
  const { createEmptyScheduleDraft, createEditScheduleDraft, taskToEvent } = mountCalendar().exports;
  assert.deepEqual(createEmptyScheduleDraft("2026-10-01").chargeRates, { male: null, female: null });
  const event = taskToEvent(task("2026-10-01", { male: 0, female: 999999999999 }));
  const draft = createEditScheduleDraft(event);
  assert.deepEqual(draft.chargeRates, { male: 0, female: 999999999999 });
  draft.chargeRates.female = null;
  assert.equal(event.chargeRates.female, 999999999999);
  const legacy = task("2026-10-02");
  delete legacy.chargeRates;
  assert.deepEqual(taskToEvent(legacy).chargeRates, { male: null, female: null });
});

test("create modal puts a two-column farm charge section after address and sends exact integers", async () => {
  const harness = mountCalendar();
  let page = harness.render();
  page.openCreateModal("2026-10-01");
  page = harness.render();
  page.setCreateDraft(draft => ({ ...draft, ownerUuid: "owner", ownerPhone: "01000000000", address: "농장 주소", title: "수확", chargeRates: { male: 140000, female: 0 } }));
  page = harness.render();
  const html = renderToStaticMarkup(page.tree);
  assert.ok(html.indexOf("농장주소 *") < html.indexOf("농가 청구단가"));
  assert.ok(html.indexOf("농가 청구단가") < html.indexOf("현장 메모"));
  assert.match(html, /scheduleChargeRateColumns/);
  assert.match(html, /남자 인건비/);
  assert.match(html, /여자 인건비/);
  assert.match(html, /value="140,000"/);
  await page.submitCreateSchedule();
  assert.deepEqual(harness.calls[0].args[1].chargeRates, { male: 140000, female: 0 });
});

test("range edit clears one rate, preserves zero and existing schedule fields across the full block", async () => {
  const harness = mountCalendar();
  const event = harness.exports.groupTasksIntoEvents([task("2026-10-01"), task("2026-10-02")])[0];
  let page = harness.render();
  page.setEvents([event]);
  page.openEditModal(event);
  page = harness.render();
  assert.deepEqual(page.editDraft.chargeRates, { male: 140000, female: 130000 });
  page.setEditDraft(draft => ({ ...draft, chargeRates: { male: null, female: 0 } }));
  page = harness.render();
  const html = renderToStaticMarkup(page.tree);
  assert.ok(html.indexOf("농장주소 *") < html.indexOf("농가 청구단가"));
  assert.ok(html.indexOf("농가 청구단가") < html.indexOf("현장 메모"));
  const originalFormData = globalThis.FormData;
  globalThis.FormData = class { get(key) { return { title: "수확", memo: "일정 메모", requiredMen: "2", requiredWomen: "3" }[key]; } };
  page.editFormRef.current = {};
  try { await page.submitEditSchedule(); } finally { globalThis.FormData = originalFormData; }
  const payload = harness.calls[0].args[1];
  assert.deepEqual(payload.chargeRates, { male: null, female: 0 });
  assert.deepEqual(payload.taskIds, event.taskIds);
  for (const key of ["startTime", "endTime", "address", "memo", "siteMemo", "siteName", "clientWorkSiteUuid", "requiredMen", "requiredWomen", "workTypeCodes"]) {
    assert.deepEqual(payload[key], event[key], key);
  }
  const saved = harness.render().events[0];
  assert.deepEqual(saved.chargeRates, { male: null, female: 0 });
  assert.deepEqual(saved.assignments, event.assignments);
});

test("move and both resize modes retain rates, assignments and other event fields", () => {
  const harness = mountCalendar();
  const page = harness.render();
  const event = harness.exports.taskToEvent(task("2026-10-01", { male: 0, female: 999999999999 }));
  for (const [mode, date] of [["move", "2026-10-03"], ["resize-start", "2026-09-30"], ["resize-end", "2026-10-03"]]) {
    const adjusted = page.createAdjustedEvent(event, date, mode);
    for (const key of Object.keys(event).filter(key => !["startDate", "endDate"].includes(key))) assert.deepEqual(adjusted[key], event[key], key);
  }
});

test("API serializes optional, null, clear, zero and maximum rates without coercion", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({}) }; };
  try {
    for (const save of [payload => api.createScheduleTask("test", payload), payload => api.updateScheduleTask("test", "2026-10-01", "day", payload), payload => api.updateScheduleTaskRange("test", payload)]) {
      await save({ title: "unchanged" });
      assert.equal(Object.hasOwn(calls.at(-1).payload, "chargeRates"), false);
      for (const chargeRates of [null, { male: null, female: null }, { male: 0, female: 999999999999 }]) {
        await save({ chargeRates });
        assert.deepEqual(calls.at(-1).payload.chargeRates, chargeRates);
      }
    }
    await api.rescheduleScheduleRange("test", { startDate: "2026-10-03", endDate: "2026-10-04", taskIds: ["day"] });
    assert.deepEqual(calls.at(-1).payload, { startDate: "2026-10-03", endDate: "2026-10-04", taskIds: ["day"] });
  } finally { globalThis.fetch = originalFetch; }
});
