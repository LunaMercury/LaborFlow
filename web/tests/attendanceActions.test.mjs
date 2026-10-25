import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createServer } from "vite";

globalThis.window = {
  location: { hostname: "localhost", port: "5580", protocol: "http:", search: "" },
  localStorage: { getItem: () => null },
};
const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent", server: { middlewareMode: true } });
const { confirmPlannedAttendance } = await server.ssrLoadModule("/src/api/attendanceApi.ts");
const { AttendancePage } = await server.ssrLoadModule("/src/pages/AttendancePage.tsx");
const { WorkSchedulePage } = await server.ssrLoadModule("/src/pages/WorkSchedulePage.tsx");
after(() => server.close());

test("attendance has no date-wide confirmation action in its top header", () => {
  const html = renderToStaticMarkup(React.createElement(AttendancePage, { loginId: "fiction", onNavigate() {} }));
  assert.ok(!html.includes("모두 예정대로"));
  assert.ok(html.includes("근태 날짜 선택"));
});

test("assignment page keeps attendance navigation but no date or week attendance confirmations", () => {
  const html = renderToStaticMarkup(React.createElement(WorkSchedulePage, { loginId: "fiction", onNavigate() {} }));
  assert.ok(html.includes("근태 관리"));
  assert.ok(!html.includes("예정대로"));
});

test("planned-work confirmation sends only the selected office and task, returning the server count", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: new URL(String(url)), init });
    return Response.json({ confirmedCount: 2 });
  };
  try {
    assert.equal(await confirmPlannedAttendance("fiction office", { scope: "SCHEDULE_DAY", scheduleDayUuid: "task-a" }), 2);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.pathname, "/api/attendance/confirm-planned");
    assert.equal(requests[0].url.searchParams.get("loginId"), "fiction office");
    assert.equal(requests[0].init.method, "POST");
    assert.deepEqual(JSON.parse(requests[0].init.body), { scope: "SCHEDULE_DAY", scheduleDayUuid: "task-a" });
    assert.deepEqual(requests[0].init.headers, { "Content-Type": "application/json" });
  } finally { globalThis.fetch = previous; }
});

test("failed confirmation is not reported as success and can be retried with the unchanged scope", async () => {
  const previous = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, init) => {
    bodies.push(init.body);
    return bodies.length === 1 ? new Response(null, { status: 503 }) : Response.json({ confirmedCount: 0 });
  };
  const payload = { scope: "SCHEDULE_DAY", scheduleDayUuid: "task-a" };
  try {
    await assert.rejects(() => confirmPlannedAttendance("fiction", payload), /예정 근무를 확정하지 못했습니다/);
    assert.equal(await confirmPlannedAttendance("fiction", payload), 0);
    assert.deepEqual(bodies, [JSON.stringify(payload), JSON.stringify(payload)]);
  } finally { globalThis.fetch = previous; }
});

const compiled = ts.transpileModule(readFileSync(new URL("../src/pages/AttendancePage.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const attendanceApi = await server.ssrLoadModule("/src/api/attendanceApi.ts");
const dateNavigation = await server.ssrLoadModule("/src/components/DateNavigation.tsx");
const dateHelpers = await server.ssrLoadModule("/src/components/dateNavigationHelpers.ts");
const placeholder = () => null;

// Run real page handlers with isolated hook state and the real attendance API adapter.
function mountAttendance(onNavigate = () => {}) {
  const slots = [];
  let cursor = 0;
  let dirty = true;
  let effects = [];
  let tree;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; dirty = true; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) slots[index] = { deps, value: factory() };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
    },
  };
  hooks.useCallback = (callback, deps) => hooks.useMemo(() => callback, deps);
  const imports = {
    "../api/attendanceApi": attendanceApi,
    "../components/DateNavigation": dateNavigation,
    "../components/dateNavigationHelpers": dateHelpers,
    "../api/workforceApi": { fetchWorkers: async () => [], fetchWorkTypes: async () => [] },
    "../api/noShowApi": { subscribeNoShowsChanged: () => () => {}, notifyNoShowsChanged() {} },
    "../data/workTypeOptions": { workTypeOptions: [] },
    ...Object.fromEntries(["StatusSnackbar", "WorkerProfileModal", "NoShowHistoryModal", "AttendanceNoShowReplacementModal", "NoShowCreateModal"].map(name => [`../components/${name}`, { [name]: placeholder }])),
  };
  const exports = {};
  new Function("require", "exports", compiled)(path => {
    if (path === "react") return hooks;
    if (path === "react/jsx-runtime") return jsxRuntime;
    if (path.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, name) => name }) };
    assert.ok(imports[path], `Unexpected dependency ${path}`);
    return imports[path];
  }, exports);
  function render() {
    cursor = 0; effects = []; dirty = false;
    tree = exports.AttendancePage({ loginId: "fiction", onNavigate });
    effects.forEach(effect => effect());
  }
  function all() {
    function visit(node) {
      if (Array.isArray(node)) return node.flatMap(visit);
      if (!node || typeof node !== "object" || !node.props) return [];
      return [node, ...visit(node.props.children)];
    }
    return visit(tree);
  }
  render();
  return {
    all,
    async flush() { for (let i = 0; i < 8; i++) { await setImmediate(); if (dirty) render(); } },
    taskButton(id) { return all().find(node => node.type === "section" && node.key === id)?.props.children[0].props.children[1].props.children.at(-1); },
    input(label) { return all().find(node => node.props["aria-label"] === label); },
    note(id) { return all().find(node => node.type === "textarea" && node.props.id === `attendance-note-${id}`); },
    message() { return all().find(node => node.type === placeholder && "message" in node.props)?.props.message; },
    close() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

const task = id => ({ scheduleDayUuid: id, workDate: "2000-01-01", workTitle: id, ownerName: "농가", siteName: "현장", taskNote: "", address: "주소" });
const record = (id, taskId, extra = {}) => ({
  ...task(taskId), assignmentUuid: id, displayName: id, participantType: "registered", workerProfileUuid: id,
  area: "men", pickupLocation: "", actualStartTime: "", actualEndTime: "", breakMinutes: 0,
  plannedStartTime: "08:00", plannedEndTime: "17:00", status: "DRAFT", timeEntryType: "UNKNOWN", confirmed: false,
  ...extra,
});

async function scenario(run, options = {}) {
  const previousFetch = globalThis.fetch;
  const previousConfirm = window.confirm;
  const previousSearch = window.location.search;
  window.location.search = "?workDate=2000-01-01";
  const rows = options.records ?? [record("worker-a", "a"), record("worker-b", "b")];
  const requests = [];
  let confirmations = 0;
  let reads = 0;
  window.confirm = () => { confirmations++; return options.accept !== false; };
  globalThis.fetch = async (url, init) => {
    if (!init) { reads++; return Response.json({ records: rows, tasks: [task("a"), task("b")] }); }
    requests.push(JSON.parse(init.body));
    if (options.respond) return options.respond(requests.length);
    for (const row of rows) if (row.scheduleDayUuid === requests.at(-1).scheduleDayUuid && !row.confirmed && !row.noShowIncidentUuid && row.status === "DRAFT") Object.assign(row, { status: "WORKED", confirmed: true, actualStartTime: row.plannedStartTime, actualEndTime: row.plannedEndTime, breakMinutes: 60, timeEntryType: "PLANNED" });
    return Response.json({ confirmedCount: 1 });
  };
  const navigation = [];
  const ui = mountAttendance(path => navigation.push(path));
  try { await ui.flush(); await run({ ui, rows, requests, navigation, confirmations: () => confirmations, reads: () => reads }); }
  finally { ui.close(); globalThis.fetch = previousFetch; window.confirm = previousConfirm; window.location.search = previousSearch; }
}

test("each task header ends with count, journal, finance and its own confirmation", async () => {
  await scenario(async ({ ui, navigation }) => {
    for (const id of ["a", "b"]) {
      const header = ui.all().find(node => node.type === "section" && node.key === id).props.children[0];
      const html = renderToStaticMarkup(header);
      assert.match(html, /1<\/strong>명|1명/);
      assert.ok(html.indexOf("작업일지") < html.indexOf("수익·정산"));
      assert.ok(html.indexOf("수익·정산") < html.indexOf("모두 예정대로 근무"));
      header.props.children[1].props.children[2].props.onClick();
    }
    assert.deepEqual(navigation, ["/finance?scheduleDayUuid=a&workDate=2000-01-01", "/finance?scheduleDayUuid=b&workDate=2000-01-01"]);
  });
});

test("confirming one task keeps another task's unsaved attendance and note", async () => {
  await scenario(async ({ ui, requests, reads }) => {
    ui.input("worker-b 실제 시작 시간").props.onChange({ target: { value: "09:15" } });
    ui.note("b").props.onChange({ target: { value: "저장 전 메모" } });
    await ui.flush();
    ui.taskButton("a").props.onClick();
    await ui.flush();
    assert.deepEqual(requests, [{ scope: "SCHEDULE_DAY", scheduleDayUuid: "a" }]);
    assert.equal(reads(), 2);
    assert.equal(ui.input("worker-a 실제 시작 시간").props.value, "08:00");
    assert.equal(ui.input("worker-a 근태 상태").props.value, "WORKED");
    assert.equal(ui.input("worker-b 실제 시작 시간").props.value, "09:15");
    assert.equal(ui.input("worker-b 근태 상태").props.value, "WORKED");
    assert.equal(ui.note("b").props.value, "저장 전 메모");
  });
});

test("own unsaved records and notes block confirmation before prompting", async () => {
  for (const edit of [ui => ui.input("worker-a 실제 시작 시간").props.onChange({ target: { value: "09:15" } }), ui => ui.note("a").props.onChange({ target: { value: "미저장" } })]) {
    await scenario(async ({ ui, requests, confirmations }) => {
      edit(ui); await ui.flush();
      ui.taskButton("a").props.onClick(); await ui.flush();
      assert.equal(requests.length, 0);
      assert.equal(confirmations(), 0);
      assert.match(ui.message(), /이 작업에 저장하지 않은/);
    });
  }
});

test("duplicate clicks including a different task cannot start concurrent requests; failures unlock retry", async () => {
  let finish;
  await scenario(async ({ ui, requests, confirmations }) => {
    const first = ui.taskButton("a");
    const other = ui.taskButton("b");
    first.props.onClick(); first.props.onClick(); other.props.onClick();
    assert.equal(requests.length, 1);
    assert.equal(confirmations(), 1);
    await ui.flush();
    assert.equal(ui.taskButton("a").props.disabled, true);
    assert.equal(ui.taskButton("b").props.disabled, true);
    finish(new Response(null, { status: 503 }));
    await ui.flush();
    assert.match(ui.message(), /예정 근무를 확정하지 못했습니다/);
    assert.equal(ui.taskButton("a").props.disabled, false);
    ui.taskButton("a").props.onClick(); await ui.flush();
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0], requests[1]);
  }, { respond: count => count === 1 ? new Promise(resolve => { finish = resolve; }) : Response.json({ confirmedCount: 0 }) });
});

test("confirmed work, absence, no-show and cancellation do not enable task confirmation", async () => {
  for (const extra of [{ status: "WORKED", confirmed: true }, { status: "ABSENT", confirmed: true }, { status: "CANCELLED", confirmed: true }, { noShowIncidentUuid: "incident" }]) {
    await scenario(async ({ ui, requests }) => {
      assert.equal(ui.taskButton("a").props.disabled, true);
      ui.taskButton("a").props.onClick(); await ui.flush();
      assert.equal(requests.length, 0);
    }, { records: [record("worker-a", "a", extra), record("worker-b", "b")] });
  }
});

test("task confirmation ignores the display status filter, and cancelled prompts make no request", async () => {
  await scenario(async ({ ui, requests }) => {
    ui.all().find(node => node.type === "button" && node.props.children === "미확인").props.onClick();
    await ui.flush(); ui.taskButton("a").props.onClick(); await ui.flush();
    assert.deepEqual(requests, [{ scope: "SCHEDULE_DAY", scheduleDayUuid: "a" }]);
  });
  await scenario(async ({ ui, requests }) => { ui.taskButton("a").props.onClick(); await ui.flush(); assert.equal(requests.length, 0); }, { accept: false });
});
