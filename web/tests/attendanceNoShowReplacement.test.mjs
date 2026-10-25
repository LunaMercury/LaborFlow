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
    input(value) { return all().find(node => node.type === "input" && node.props.type === "radio" && node.props.value === value); },
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
    if (init?.method === "POST") return options.write ? options.write(request, requests.filter(item => item.init?.method === "POST").length) : Response.json(target);
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
    // Mutation cases start after searching; search:null exercises the initial empty input.
    const search = ui.all().find(node => node.props.type === "search");
    if (options.search !== null && !search.props.disabled) {
      search.props.onChange({ target: { value: options.search ?? "candidate" } });
      await ui.flush();
    }
    await run(ui, { requests, writes: () => requests.filter(item => item.init?.method === "POST"), saved: () => saved, closed: () => closed });
  } finally { ui.unmount(); globalThis.fetch = previous; }
}

test("loads the attendance date and shows only active unassigned registered workers, ranking matching work first", async () => {
  await scenario(async (ui, state) => {
    assert.deepEqual(ui.all().filter(node => node.type === "input" && node.props.type === "radio").map(node => node.props.value), ["free", "no-match"]);
    assert.equal(ui.dialog().props.title, "대체자 선택");
    assert.equal(ui.save().props.disabled, true);
    assert.equal(ui.save().props.children, "대체 적용");
    assert.equal(state.requests.find(item => item.url.pathname === "/api/schedule/tasks").url.searchParams.get("workDate"), record.workDate);
    assert.equal(state.requests[0].url.searchParams.get("loginId"), "fiction office");
    assert.doesNotMatch(ui.html(), /시간 중복을 확인|현재배정/);
  }, {
    search: "가상",
    workers: [worker("original"), worker("existing"), worker("inactive", [], { isActive: false }), worker(undefined), worker("no-match", [], { name: "가상 불일치" }), worker("busy"), worker("free", ["garlic"], { name: "가상 자유" })],
    tasks: [{ ...target, assignments: [...target.assignments, assignment("existing")] }, other("other", ["busy"])],
  });
});

test("other assignments exclude candidates for the entire date, including non-overlapping work", async () => {
  const tasks = [target, other("other", ["busy"]), other("later", ["later"], "12:00", "14:00")];
  await scenario(async (ui, state) => {
    assert.equal(ui.input("busy"), undefined);
    assert.equal(ui.input("later"), undefined);
    assert.equal(ui.save().props.disabled, true);
    assert.match(ui.html(), /선택 가능한 미배정 작업자가 없습니다/);
    ui.save().props.onClick(); await ui.flush();
    assert.equal(state.writes().length, 0);
    assert.deepEqual(tasks[1].assignments, [assignment("busy")]);
  }, { workers: [worker("busy"), worker("later")], tasks });
});

test("name and nickname search is local, preserves Korean input, and never reveals excluded workers", async () => {
  await scenario(async (ui, state) => {
    const search = () => ui.all().find(node => node.props.type === "search");
    search().props.onChange({ target: { value: "김 철" } }); await ui.flush();
    assert.equal(search().props.value, "김 철");
    assert.deepEqual(ui.all().filter(node => node.props.type === "radio").map(node => node.props.value), ["free"]);
    assert.match(ui.html(), /가상 철수/);
    ui.input("free").props.onChange(); await ui.flush();
    assert.equal(ui.save().props.disabled, false);
    search().props.onChange({ target: { value: "앞산" } }); await ui.flush();
    assert.deepEqual(ui.all().filter(node => node.props.type === "radio").map(node => node.props.value), ["nickname-only"]);
    assert.equal(ui.save().props.disabled, true);
    search().props.onChange({ target: { value: "없음" } }); await ui.flush();
    assert.match(ui.html(), /검색 결과가 없습니다/);
    search().props.onChange({ target: { value: "" } }); await ui.flush();
    assert.equal(ui.all().filter(node => node.props.type === "radio").length, 0);
    assert.ok(!ui.all().some(node => node.props.className === "candidates"));
    assert.equal(state.requests.length, 2);
    assert.equal(state.writes().length, 0);
  }, { workers: [worker("free", ["garlic"], { name: "김철수", nickname: "가상 철수" }), worker("nickname-only", [], { name: "", nickname: "앞산아주머니" }), worker("busy", [], { name: "김철수" }), worker("inactive", [], { name: "김철수", isActive: false })], tasks: [target, other("other", ["busy"])] });
});

test("cancelled and replaced assignment history does not hide otherwise available workers", async () => {
  await scenario(async (ui) => {
    assert.deepEqual(ui.all().filter(node => node.props.type === "radio").map(node => node.props.value), ["cancelled-worker", "replaced-worker"]);
  }, { search: "worker", workers: [worker("cancelled-worker"), worker("replaced-worker"), worker("absent-worker")], tasks: [target, { ...other("history", []), assignments: [
    { ...assignment("cancelled-worker"), assignmentStatus: "CANCELLED" },
    { ...assignment("replaced-worker"), assignmentStatus: "replaced" },
    { ...assignment("absent-worker"), assignmentStatus: "absent" },
  ] }] });
});

test("both selection and change hide candidates until typing and hide them again for empty or whitespace input", async () => {
  for (const status of ["OPEN", "REPLACED"]) {
    await scenario(async (ui, state) => {
      const search = () => ui.all().find(node => node.props.type === "search");
      assert.ok(!ui.all().some(node => node.props.className === "candidates"));
      assert.doesNotMatch(ui.html(), /검색 결과가 없습니다|선택 가능한 미배정/);
      assert.equal(ui.save().props.disabled, true);
      search().props.onChange({ target: { value: "candidate" } }); await ui.flush();
      assert.ok(ui.input("candidate"));
      ui.input("candidate").props.onChange(); await ui.flush();
      assert.equal(ui.save().props.disabled, false);
      search().props.onChange({ target: { value: " \t " } }); await ui.flush();
      assert.ok(!ui.all().some(node => node.props.className === "candidates"));
      assert.equal(ui.save().props.disabled, true);
      search().props.onChange({ target: { value: "missing" } }); await ui.flush();
      assert.match(ui.html(), /검색 결과가 없습니다/);
      search().props.onChange({ target: { value: "" } }); await ui.flush();
      assert.ok(!ui.all().some(node => node.props.className === "candidates"));
      assert.equal(state.requests.length, 2);
      assert.equal(state.writes().length, 0);
    }, { search: null, record: { noShowIncidentStatus: status }, tasks: [{ ...target, assignments: [{ ...target.assignments[0], noShowIncidentStatus: status }] }] });
  }
});

test("closing without a replacement never saves or changes the original no-show and assignments", async () => {
  const tasks = structuredClone([target]);
  const before = structuredClone(tasks);
  await scenario(async (ui, state) => {
    assert.equal(ui.save().props.disabled, true);
    ui.dialog().props.onClose(); await ui.flush();
    assert.equal(state.closed(), 1);
    assert.equal(state.saved(), 0);
    assert.equal(state.writes().length, 0);
    assert.deepEqual(tasks, before);
    assert.equal(tasks[0].assignments[0].noShowIncidentStatus, "OPEN");
  }, { tasks });
});

test("one transactional POST is used for first assignment and changes, and duplicate clicks cannot duplicate writes", async () => {
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

test("future, missing tasks and cancelled assignments never enable replacement", async () => {
  for (const options of [
    { record: { workDate: "2999-01-01" } },
    { tasks: [] },
    { record: { status: "CANCELLED" } },
    { tasks: [{ ...target, assignments: [{ ...target.assignments[0], assignmentStatus: "cancelled" }] }] },
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

test("empty schedule metadata does not hide attendance metadata or block search", async () => {
  await scenario(async (ui) => {
    assert.equal(ui.dialog().props.title, "대체자 변경");
    ui.input("candidate").props.onChange(); await ui.flush();
    assert.equal(ui.save().props.disabled, false);
  }, {
    record: { noShowIncidentUuid: "incident", noShowIncidentStatus: "REPLACED", noShowReplacementWorkerProfileUuid: "previous" },
    tasks: [{ ...target, assignments: [{ ...assignment("original"), assignmentUuid: record.assignmentUuid, noShowIncidentStatus: "" }, assignment("previous")] }],
  });
  await scenario(async (ui, state) => {
    assert.equal(ui.all().find(node => node.props.type === "search").props.disabled, false);
    ui.input("candidate").props.onChange(); await ui.flush();
    assert.equal(ui.save().props.disabled, false);
    assert.equal(state.writes().length, 0);
  }, {
    record: { noShowIncidentUuid: "incident", noShowIncidentStatus: "OPEN" },
    tasks: [{ ...target, assignments: [{ ...target.assignments[0], noShowIncidentStatus: "CANCELLED" }] }],
  });
});

test("unconfirmed, worked, anonymous and previously cancelled no-show records can search and apply directly", async () => {
  for (const row of [
    { status: "DRAFT", attendanceUuid: null },
    { status: "WORKED" },
    { status: "DRAFT", participantType: "guest", workerProfileUuid: null, attendanceUuid: null },
    { status: "ABSENT" },
  ]) {
    await scenario(async (ui, state) => {
      assert.equal(ui.all().find(node => node.props.type === "search").props.disabled, false);
      assert.doesNotMatch(ui.html(), /저장된 활성 노쇼/);
      ui.input("candidate").props.onChange(); await ui.flush();
      assert.equal(ui.save().props.disabled, false);
      assert.equal(state.writes().length, 0);
      ui.save().props.onClick(); await ui.flush();
      assert.equal(state.writes().length, 1);
      assert.equal(state.writes()[0].init.method, "POST");
      assert.equal(state.writes()[0].url.pathname, "/api/schedule/tasks/target/no-show-replacement");
      assert.equal(state.saved(), 1);
    }, { record: { ...row, noShowIncidentUuid: null }, tasks: [{ ...target, assignments: [{ ...assignment("original"), assignmentUuid: record.assignmentUuid, noShowIncidentUuid: null, noShowIncidentStatus: "" }] }] });
  }
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
