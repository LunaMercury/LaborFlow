import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createServer } from "vite";

const previousWindow = globalThis.window;
const previousFetch = globalThis.fetch;
globalThis.window = Object.assign(new EventTarget(), {
  location: { hostname: "localhost", port: "5580", protocol: "http:" },
});
const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent", server: { middlewareMode: true } });
const imports = {};
for (const [key, path] of Object.entries({
  "../api/noShowApi": "/src/api/noShowApi.ts",
  "./AssignmentHistoryModal": "/src/components/AssignmentHistoryModal.tsx",
  "./StatusSnackbar": "/src/components/StatusSnackbar.tsx",
})) imports[key] = await server.ssrLoadModule(path);
after(async () => { globalThis.window = previousWindow; globalThis.fetch = previousFetch; await server.close(); });

const compiled = ts.transpileModule(readFileSync(new URL("../src/components/NoShowHistoryModal.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mountHistory() {
  const slots = [];
  let cursor = 0, dirty = true, tree, effects = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; dirty = true; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useCallback(callback) { return callback; },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
      }
    },
  };
  // Keep callback identity stable just as React does, without a DOM dependency.
  hooks.useCallback = (callback, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) slots[index] = { deps, callback };
    return slots[index].callback;
  };
  const exports = {};
  new Function("require", "exports", compiled)(path => {
    if (path === "react") return hooks;
    if (path === "react/jsx-runtime") return jsxRuntime;
    if (path.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => key }) };
    assert.ok(imports[path], `Unexpected import ${path}`);
    return imports[path];
  }, exports);
  const outer = exports.NoShowHistoryModal({ loginId: "fiction", workerProfileUuid: "worker", onClose() {} });
  function render() { cursor = 0; dirty = false; effects = []; tree = outer.type(outer.props); effects.forEach(effect => effect()); }
  function all() {
    function visit(node) {
      if (Array.isArray(node)) return node.flatMap(visit);
      if (!node?.props) return [];
      return [node, ...visit(node.props.children)];
    }
    return visit(tree);
  }
  render();
  return {
    async flush() { for (let i = 0; i < 6; i++) { await setImmediate(); if (dirty) render(); } },
    all, html: () => renderToStaticMarkup(tree),
    close() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

const incident = (uuid, workDate, status = "OPEN") => ({
  uuid, workDate, workerName: "가상 작업자", status, ownerName: "가상 농가", siteName: "가상 현장",
  workTitle: "가상 수확", note: "첫 줄\n둘째 줄", replacementWorkerName: null, revisions: [],
});

test("each incident starts as a closed native disclosure with date, worker and status in its summary", async () => {
  const requests = [];
  globalThis.fetch = async (_url, init) => { requests.push(init); return Response.json({ incidents: [incident("a", "2026-09-03"), incident("b", "2026-07-20", "CANCELLED")] }); };
  const ui = mountHistory();
  try {
    await ui.flush();
    const entries = ui.all().filter(node => node.type === "details" && node.props.className === "incident");
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      assert.equal(entry.props.open, undefined);
      const summary = entry.props.children[0];
      assert.equal(summary.type, "summary");
      assert.equal(summary.props.tabIndex, 0);
      assert.match(renderToStaticMarkup(summary), /2026-(09-03|07-20)/);
      assert.match(renderToStaticMarkup(summary), /<strong>가상 작업자<\/strong>/);
      assert.doesNotMatch(renderToStaticMarkup(summary), /가상 농가|가상 현장|첫 줄/);
      assert.match(renderToStaticMarkup(entry.props.children[1]), /가상 농가/);
    }
    assert.match(ui.html(), /취소됨/);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, undefined);
  } finally { ui.close(); }
});

test("editing stays inside its disclosure and only explicit memo save sends a mutation", async () => {
  const requests = [];
  globalThis.fetch = async (_url, init) => { requests.push(init); return Response.json({ incidents: [incident("a", "2026-09-03")] }); };
  const ui = mountHistory();
  try {
    await ui.flush();
    ui.all().find(node => node.type === "button" && node.props.children === "메모 수정").props.onClick();
    await ui.flush();
    const input = ui.all().find(node => node.type === "textarea");
    input.props.onChange({ target: { value: "작성 중\n유지할 메모" } });
    await ui.flush();
    assert.equal(ui.all().find(node => node.type === "textarea").props.value, "작성 중\n유지할 메모");
    assert.equal(ui.all().find(node => node.type === "details").props.open, undefined);
    assert.equal(requests.length, 1);
    ui.all().find(node => node.type === "button" && node.props.children === "메모 저장").props.onClick();
    await ui.flush();
    const writes = requests.filter(request => request.method === "PATCH");
    assert.equal(writes.length, 1);
    assert.deepEqual(JSON.parse(writes[0].body), { note: "작성 중\n유지할 메모" });
  } finally { ui.close(); }
});
