import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createServer } from "vite";

globalThis.window = {
  location: { hostname: "localhost", port: "5580", protocol: "http:", search: "" },
  localStorage: { getItem: () => null },
};
const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent", server: { middlewareMode: true } });
after(() => server.close());
const imports = {};
for (const path of ["../api/assignmentCautionsApi", "../api/scheduleApi", "../api/workforceApi", "./AssignmentCautionDialog", "./AssignmentHistoryModal"]) {
  imports[path] = await server.ssrLoadModule(`/src/${path.startsWith("../") ? path.slice(3) : `components/${path.slice(2)}`}.tsx`.replace(/(Api)\.tsx$/, "$1.ts"));
}
const source = readFileSync(new URL("../src/components/AttendanceNoShowReplacementModal.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

// Exercise the component's hooks and event handlers without a DOM dependency or live API.
function mount(props) {
  const slots = [];
  let cursor = 0;
  let dirty = true;
  let tree;
  let effects = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; dirty = true; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useMemo(factory) { return factory(); },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  const exports = {};
  new Function("require", "exports", compiled)(path => {
    if (path === "react") return hooks;
    if (path === "react/jsx-runtime") return jsxRuntime;
    if (path.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, name) => name }) };
    assert.ok(imports[path], `Unexpected dependency ${path}`);
    return imports[path];
  }, exports);
  const content = exports.AttendanceNoShowReplacementModal(props);
  function render() {
    cursor = 0;
    effects = [];
    dirty = false;
    tree = content.type(content.props);
    for (const effect of effects) effect();
  }
  render();
  const all = () => {
    const result = [];
    const visit = node => {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node || typeof node !== "object" || !node.props) return;
      result.push(node);
      visit(node.props.children);
    };
    visit(tree);
    return result;
  };
  return {
    async flush() { for (let i = 0; i < 6; i++) { await setImmediate(); if (dirty) render(); } },
    all,
    input(value) { return all().find(node => node.type === "input" && node.props.value === value); },
    save() { return all().find(node => node.type === "button" && node.props.className === "saveButton"); },
    dialog() { return all().find(node => node.type === imports["./AssignmentHistoryModal"].HistoryDialog); },
    caution() { return all().find(node => node.type === imports["./AssignmentCautionDialog"].AssignmentCautionDialog); },
    html() { return renderToStaticMarkup(tree); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

const record = {
  workDate: "2000-01-01", scheduleDayUuid: "target", assignmentUuid: "original-assignment",
  workerProfileUuid: "original", attendanceUuid: "saved-attendance", participantType: "registered",
  status: "ABSENT", displayName: "원작업자", workTitle: "마늘 수확", ownerName: "거래처",
};
const worker = (id, workTypeCodes = ["garlic"], extra = {}) => ({
  profileUuid: id, name: id ?? "unregistered", phone: "", pickupLocation: "정류장", workTypeCodes, ...extra,
});
const assignment = workerProfileUuid => ({ workerProfileUuid, assignmentStatus: "planned", area: "men", workerCount: 1 });
const target = {
  id: "target", title: "마늘 수확", ownerName: "거래처", ownerUuid: "owner", workTypeCodes: ["garlic"],
  startTime: "08:00", endTime: "12:00", timeRange: "08:00~12:00",
  assignments: [{ ...assignment("original"), assignmentUuid: "original-assignment", assignmentStatus: "absent", noShowIncidentUuid: "incident", noShowIncidentStatus: "OPEN" }],
};
const other = (id, ids, startTime = "09:00", endTime = "11:00") => ({
  ...target, id, title: id, startTime, endTime, timeRange: `${startTime}~${endTime}`, assignments: ids.map(assignment),
});

async function scenario(run, options = {}) {
  const previous = globalThis.fetch;
  const requests = [];
  let saved = 0;
  let closed = 0;
  globalThis.fetch = async (url, init) => {
    const request = { url: new URL(String(url)), init };
    requests.push(request);
    if (init?.method === "PUT") return options.write ? options.write(request, requests.filter(item => item.init?.method === "PUT").length) : Response.json(target);
    if (request.url.pathname === "/api/workforce/workers") {
      if (options.loadFailure) return new Response(null, { status: 503 });
      return Response.json({ workers: options.workers ?? [worker("candidate")] });
    }
    if (request.url.pathname === "/api/schedule/tasks") return Response.json({ tasks: options.tasks ?? [target] });
    throw new Error(`Unexpected mocked request ${url}`);
  };
  const ui = mount({ loginId: "fiction office", record: { ...record, ...options.record }, onClose() { closed++; }, onSaved() { saved++; } });
  try {
    await ui.flush();
    await run(ui, { requests, writes: () => requests.filter(item => item.init?.method === "PUT"), saved: () => saved, closed: () => closed });
  } finally { ui.unmount(); globalThis.fetch = previous; }
}

test("loads the attendance date, filters registered active candidates, and ranks matches then assignment counts", async () => {
  await scenario(async (ui, state) => {
    assert.deepEqual(ui.all().filter(node => node.type === "input" && node.props.type === "radio").map(node => node.props.value), ["free", "busy", "no-match"]);
    assert.equal(ui.dialog().props.title, "대체자 선택");
    assert.equal(ui.save().props.disabled, true);
    assert.equal(state.requests.find(item => item.url.pathname === "/api/schedule/tasks").url.searchParams.get("workDate"), record.workDate);
    assert.equal(state.requests[0].url.searchParams.get("loginId"), "fiction office");
    assert.match(ui.html(), /class="currentAssignment">현재배정 : other\/거래처/);
    const css = readFileSync(new URL("../src/components/AttendanceNoShowReplacementModal.module.css", import.meta.url), "utf8");
    assert.match(css, /\.currentAssignment\s*\{[^}]*color: var\(--color-pages-journal-page-error-text\);[^}]*font-weight: 700;/);
  }, {
    workers: [worker("original"), worker("existing"), worker("inactive", [], { isActive: false }), worker(undefined), worker("no-match", []), worker("busy"), worker("free")],
    tasks: [{ ...target, assignments: [...target.assignments, assignment("existing")] }, other("other", ["busy"])],
  });
});

test("overlap requires explicit acknowledgement, keeps other assignments, and resets acknowledgement on selection change", async () => {
  const tasks = [target, other("other", ["busy"]), other("later", ["later"], "12:00", "14:00")];
  await scenario(async (ui, state) => {
    ui.input("busy").props.onChange(); await ui.flush();
    assert.equal(ui.save().props.disabled, true);
    assert.match(ui.html(), /시간 중복/);
    assert.match(ui.html(), /다른 작업의 기존 배정은 유지됩니다/);
    ui.all().find(node => node.props.type === "checkbox").props.onChange({ target: { checked: true } }); await ui.flush();
    assert.equal(ui.save().props.disabled, false);
    ui.input("later").props.onChange(); await ui.flush();
    assert.equal(ui.save().props.disabled, false);
    assert.ok(!ui.all().some(node => node.props.type === "checkbox"));
    ui.input("busy").props.onChange(); await ui.flush();
    assert.equal(ui.save().props.disabled, true);
    ui.all().find(node => node.props.type === "checkbox").props.onChange({ target: { checked: true } }); await ui.flush();
    ui.save().props.onClick(); await ui.flush();
    assert.equal(state.writes().length, 1);
    assert.deepEqual(JSON.parse(state.writes()[0].init.body), { originalAssignmentUuid: record.assignmentUuid, replacementWorkerProfileUuid: "busy", acknowledgedCautions: [] });
    assert.equal(state.writes()[0].url.pathname, "/api/schedule/tasks/target/no-show-replacement");
    assert.equal(state.saved(), 1);
    assert.equal(state.closed(), 1);
    assert.deepEqual(tasks[1].assignments, [assignment("busy")]);
  }, { workers: [worker("busy"), worker("later")], tasks });
});

test("PUT is used for first assignment and changes, and duplicate clicks cannot duplicate writes", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await scenario(async (ui, state) => {
    assert.equal(ui.dialog().props.title, "대체자 변경");
    assert.ok(!ui.input("previous"));
    ui.input("candidate").props.onChange(); await ui.flush();
    const click = ui.save().props.onClick;
    click(); click(); await ui.flush();
    assert.equal(state.writes().length, 1);
    assert.equal(ui.save().props.disabled, true);
    ui.dialog().props.onClose();
    assert.equal(state.closed(), 0);
    release(Response.json(target)); await ui.flush();
    assert.equal(state.saved(), 1);
    click(); await ui.flush();
    assert.equal(state.writes().length, 1);
  }, { workers: [worker("candidate"), worker("previous")], tasks: [{ ...target, assignments: [{ ...target.assignments[0], noShowIncidentStatus: "REPLACED", noShowReplacementWorkerProfileUuid: "previous" }, assignment("previous")] }], write: () => pending });
});

test("server failure keeps selection and modal open with an inline error and a working retry", async () => {
  await scenario(async (ui, state) => {
    ui.input("candidate").props.onChange(); await ui.flush();
    ui.save().props.onClick(); await ui.flush();
    assert.match(ui.html(), /role="alert">저장 실패/);
    assert.equal(ui.input("candidate").props.checked, true);
    assert.equal(ui.save().props.disabled, false);
    assert.equal(state.saved(), 0); assert.equal(state.closed(), 0);
    ui.save().props.onClick(); await ui.flush();
    assert.equal(state.saved(), 1);
    assert.equal(state.writes().length, 2);
  }, { write: (_request, count) => count === 1 ? Response.json({ message: "저장 실패" }, { status: 503 }) : Response.json(target) });
});

test("caution confirmation retries with merged version acknowledgements and cancel preserves selection", async () => {
  const conflict = (uuid, updatedAt) => ({ uuid, updatedAt, workerName: "candidate", clientName: "거래처", requestedBy: "CLIENT" });
  const conflicts = [[conflict("a", "v1")], [conflict("a", "v2"), conflict("b", "v1")]];
  await scenario(async (ui, state) => {
    ui.input("candidate").props.onChange(); await ui.flush();
    ui.save().props.onClick(); await ui.flush();
    assert.equal(ui.dialog().props.inactive, true);
    ui.caution().props.onClose(); await ui.flush();
    assert.equal(ui.input("candidate").props.checked, true);
    assert.equal(state.writes().length, 1);
    ui.save().props.onClick(); await ui.flush();
    ui.caution().props.onConfirm(); await ui.flush();
    assert.deepEqual(JSON.parse(state.writes()[2].init.body).acknowledgedCautions, [{ uuid: "a", updatedAt: "v1" }]);
    ui.caution().props.onConfirm(); await ui.flush();
    assert.deepEqual(JSON.parse(state.writes()[3].init.body).acknowledgedCautions, [{ uuid: "a", updatedAt: "v2" }, { uuid: "b", updatedAt: "v1" }]);
    assert.equal(state.saved(), 1);
  }, { write: (_request, count) => count <= 3 ? Response.json({ code: "ASSIGNMENT_CAUTION_CONFLICT", conflicts: conflicts[count === 3 ? 1 : 0] }, { status: 409 }) : Response.json(target) });
});

test("saved anonymous guest incidents can select and change replacements from registered active candidates", async () => {
  for (const status of ["OPEN", "REPLACED"]) {
    const guestAssignment = {
      ...target.assignments[0], participantType: "guest", workerProfileUuid: null,
      noShowIncidentStatus: status, noShowReplacementWorkerProfileUuid: status === "REPLACED" ? "previous" : null,
    };
    await scenario(async (ui, state) => {
      assert.equal(ui.dialog().props.title, status === "REPLACED" ? "대체자 변경" : "대체자 선택");
      assert.deepEqual(ui.all().filter(node => node.type === "input" && node.props.type === "radio").map(node => node.props.value), ["candidate"]);
      ui.input("candidate").props.onChange(); await ui.flush();
      assert.equal(ui.save().props.disabled, false);
      ui.save().props.onClick(); await ui.flush();
      assert.equal(state.writes().length, 1);
      assert.deepEqual(JSON.parse(state.writes()[0].init.body), {
        originalAssignmentUuid: record.assignmentUuid, replacementWorkerProfileUuid: "candidate", acknowledgedCautions: [],
      });
      assert.equal(state.saved(), 1);
      assert.equal(state.closed(), 1);
    }, {
      record: { participantType: "guest", workerProfileUuid: null },
      workers: [worker("candidate"), worker("existing"), worker(undefined), worker(null), worker("inactive", [], { isActive: false }), ...(status === "REPLACED" ? [worker("previous")] : [])],
      tasks: [{ ...target, assignments: [guestAssignment, assignment("existing"), ...(status === "REPLACED" ? [assignment("previous")] : [])] }],
    });
  }
});

test("future, unsaved, non-absent, missing, and cancelled incidents never enable replacement", async () => {
  for (const options of [
    { record: { workDate: "2999-01-01" } },
    { record: { attendanceUuid: null } },
    { record: { status: "WORKED" } },
    { record: { participantType: "guest", workerProfileUuid: null, attendanceUuid: null } },
    { record: { participantType: "guest", workerProfileUuid: null, status: "WORKED" } },
    { tasks: [] },
    { tasks: [{ ...target, assignments: [{ ...target.assignments[0], noShowIncidentUuid: null, noShowIncidentStatus: undefined }] }] },
    { tasks: [{ ...target, assignments: [{ ...target.assignments[0], noShowIncidentStatus: "CANCELLED" }] }] },
  ]) {
    await scenario(async (ui, state) => {
      assert.equal(ui.save().props.disabled, true);
      assert.match(ui.html(), /role="alert"/);
      ui.save().props.onClick(); await ui.flush();
      assert.equal(state.writes().length, 0);
      if (options.record?.workDate === "2999-01-01") assert.equal(state.requests.length, 0);
    }, options);
  }
});

test("attendance metadata supports selection/change labels while fresh cancelled task metadata blocks stale records", async () => {
  await scenario(async (ui) => {
    assert.equal(ui.dialog().props.title, "대체자 변경");
    ui.input("candidate").props.onChange(); await ui.flush();
    assert.equal(ui.save().props.disabled, false);
  }, {
    record: { noShowIncidentUuid: "incident", noShowIncidentStatus: "REPLACED", noShowReplacementWorkerProfileUuid: "previous" },
    tasks: [{ ...target, assignments: [{ ...assignment("original"), assignmentUuid: record.assignmentUuid }, assignment("previous")] }],
  });
  await scenario(async (ui, state) => {
    assert.equal(ui.save().props.disabled, true);
    assert.equal(state.writes().length, 0);
  }, {
    record: { noShowIncidentUuid: "incident", noShowIncidentStatus: "OPEN" },
    tasks: [{ ...target, assignments: [{ ...target.assignments[0], noShowIncidentStatus: "CANCELLED" }] }],
  });
});

test("closing an unmounted request cannot report a save into a different attendance modal", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await scenario(async (ui, state) => {
    ui.input("candidate").props.onChange(); await ui.flush();
    ui.save().props.onClick(); await ui.flush();
    ui.unmount();
    release(Response.json(target)); await ui.flush();
    assert.equal(state.saved(), 0);
    assert.equal(state.closed(), 0);
  }, { write: () => pending });
});

test("lookup failure is visible, remains unsaveable, and retries without writes", async () => {
  await scenario(async (ui, state) => {
    assert.match(ui.html(), /작업자 목록을 불러오지 못했습니다/);
    assert.equal(ui.save().props.disabled, true);
    ui.all().find(node => node.type === "button" && node.props.children === "다시 불러오기").props.onClick(); await ui.flush();
    assert.equal(state.requests.length, 4);
    assert.equal(state.writes().length, 0);
  }, { loadFailure: true });
});
