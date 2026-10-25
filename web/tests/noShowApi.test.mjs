import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalStorage = globalThis.localStorage;
const windowTarget = new EventTarget();
windowTarget.location = { hostname: "localhost", port: "5580", protocol: "http:" };
globalThis.window = windowTarget;
const storageWrites = [];
globalThis.localStorage = { setItem: (...args) => storageWrites.push(args) };

const server = await createServer({
  appType: "custom", configFile: false, logLevel: "silent",
  root: process.cwd(), server: { middlewareMode: true },
});
const api = await server.ssrLoadModule("/src/api/noShowApi.ts");
const { NoShowHistoryModal } = await server.ssrLoadModule("/src/components/NoShowHistoryModal.tsx");
const { WorkerProfileModal } = await server.ssrLoadModule("/src/components/WorkerProfileModal.tsx");

after(async () => {
  globalThis.fetch = originalFetch;
  globalThis.window = originalWindow;
  globalThis.localStorage = originalStorage;
  await server.close();
});

const incident = {
  uuid: "incident-1", originalAssignmentUuid: "assignment-1", scheduleDayUuid: "day-1",
  workDate: "2026-10-25", workerProfileUuid: null, workerName: "익명 참여자",
  ownerName: "거래처", siteName: "현장", workTitle: "작업", status: "CANCELLED", note: null,
  replacementWorkerProfileUuid: null, replacementWorkerName: null, replacementAssignmentUuid: null,
  createdAt: "2026-10-25T08:00:00+09:00", updatedAt: "2026-10-25T09:00:00+09:00",
  cancelledAt: "2026-10-25T09:00:00+09:00",
  revisions: [{ action: "CANCELLED", note: "착오 등록", createdAt: "2026-10-25T09:00:00+09:00", performedByAccountUuid: null }],
};

test("list uses an encoded worker filter, no-store, and retains cancelled anonymous history", async () => {
  let request;
  globalThis.fetch = async (url, init) => { request = { url: new URL(url), init }; return Response.json({ incidents: [incident] }); };
  assert.deepEqual(await api.fetchNoShowIncidents("demo +&", { workerProfileUuid: "worker /+" }), [incident]);
  assert.equal(request.url.pathname, "/api/no-show/incidents");
  assert.equal(request.url.searchParams.get("loginId"), "demo +&");
  assert.equal(request.url.searchParams.get("workerProfileUuid"), "worker /+");
  assert.equal(request.url.searchParams.has("workDate"), false);
  assert.deepEqual(request.init, { cache: "no-store" });
});

test("attendance can fetch by workDate without a registered worker UUID", async () => {
  globalThis.fetch = async url => {
    const query = new URL(url).searchParams;
    assert.equal(query.get("workDate"), "2026-10-25");
    assert.equal(query.has("workerProfileUuid"), false);
    return Response.json({ incidents: [incident] });
  };
  assert.equal((await api.fetchNoShowIncidents("demo", { workDate: "2026-10-25" }))[0].workerProfileUuid, null);
});

test("unfiltered list requests are rejected before network access", async () => {
  globalThis.fetch = () => { throw new Error("must not fetch"); };
  await assert.rejects(api.fetchNoShowIncidents("demo", {}), /작업자 또는 근무일/);
  await assert.rejects(api.fetchNoShowIncidents("demo", { workerProfileUuid: "  " }), /작업자 또는 근무일/);
});

test("create records note null and notifies once only after successful response", async () => {
  let events = 0;
  const unsubscribe = api.subscribeNoShowsChanged(() => events++);
  const writesBefore = storageWrites.length;
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).pathname, "/api/no-show/incidents");
    assert.equal(new URL(url).searchParams.get("loginId"), "demo &");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(init.body), { assignmentUuid: "guest-assignment", note: null });
    assert.equal(events, 0);
    return new Response(null, { status: 204 });
  };
  try {
    assert.equal(await api.createNoShowIncident("demo &", { assignmentUuid: "guest-assignment", note: null }), undefined);
    assert.equal(events, 1);
    assert.equal(storageWrites.length, writesBefore + 1);
  } finally { unsubscribe(); }
});

test("create permits omitted note and PATCH sends null to clear notes with encoded incident UUID", async () => {
  const requests = [];
  globalThis.fetch = async (url, init) => { requests.push({ url: new URL(url), init }); return Response.json({ incident }); };
  await api.createNoShowIncident("demo", { assignmentUuid: "guest" });
  await api.updateNoShowIncidentNote("demo", "incident/+", null);
  assert.deepEqual(JSON.parse(requests[0].init.body), { assignmentUuid: "guest" });
  assert.equal(requests[1].init.method, "PATCH");
  assert.equal(requests[1].url.pathname, "/api/no-show/incidents/incident%2F%2B");
  assert.deepEqual(JSON.parse(requests[1].init.body), { note: null });
});

test("notes enforce 1000-character limits before writes", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(null, { status: 204 }); };
  await api.updateNoShowIncidentNote("demo", "id", "가".repeat(1000));
  await assert.rejects(api.updateNoShowIncidentNote("demo", "id", "가".repeat(1001)), /1,000자/);
  await assert.rejects(api.createNoShowIncident("demo", { assignmentUuid: "guest", note: "a".repeat(1001) }), /1,000자/);
  assert.equal(requests, 1);
});

test("cancel is POST with a required, bounded reason, never DELETE", async () => {
  let requests = 0;
  globalThis.fetch = async (url, init) => {
    requests++;
    assert.equal(new URL(url).pathname, "/api/no-show/incidents/incident%2F%2B/cancel");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body), { reason: "착오 등록" });
    return new Response(null, { status: 204 });
  };
  await assert.rejects(api.cancelNoShowIncident("demo", "id", " \n "), /취소 사유/);
  await assert.rejects(api.cancelNoShowIncident("demo", "id", "가".repeat(1001)), /1,000자/);
  await api.cancelNoShowIncident("demo", "incident/+", " 착오 등록 ");
  assert.equal(requests, 1);
});

test("failed mutations surface API errors without publishing changes", async () => {
  let changes = 0;
  const unsubscribe = api.subscribeNoShowsChanged(() => changes++);
  const writesBefore = storageWrites.length;
  globalThis.fetch = async () => Response.json({ message: "다른 화면에서 변경되었습니다." }, { status: 409 });
  try {
    await assert.rejects(api.createNoShowIncident("demo", { assignmentUuid: "a" }), /다른 화면/);
    await assert.rejects(api.updateNoShowIncidentNote("demo", "id", "메모"), /다른 화면/);
    await assert.rejects(api.cancelNoShowIncident("demo", "id", "착오"), /다른 화면/);
    assert.equal(changes, 0);
    assert.equal(storageWrites.length, writesBefore);
  } finally { unsubscribe(); }
});

test("non-JSON errors use fallback messages and do not expose response bodies", async () => {
  globalThis.fetch = async () => new Response("internal SQL secret", { status: 500 });
  await assert.rejects(api.fetchNoShowIncidents("demo", { workDate: "2026-10-25" }), /노쇼 이력을 불러오지 못했습니다/);
  await assert.rejects(api.updateNoShowIncidentNote("demo", "id", null), /노쇼 이력을 변경하지 못했습니다/);
});

test("subscriptions refresh across tabs, detach completely, and tolerate blocked storage", () => {
  let changes = 0;
  const unsubscribe = api.subscribeNoShowsChanged(() => changes++);
  const storageEvent = key => Object.assign(new Event("storage"), { key });
  window.dispatchEvent(storageEvent("unrelated"));
  window.dispatchEvent(storageEvent(api.noShowsChangedEvent));
  assert.equal(changes, 1);
  const previous = globalThis.localStorage;
  globalThis.localStorage = { setItem() { throw new Error("blocked"); } };
  try {
    api.notifyNoShowsChanged();
    assert.equal(changes, 2);
    unsubscribe();
    api.notifyNoShowsChanged();
    window.dispatchEvent(storageEvent(api.noShowsChangedEvent));
    assert.equal(changes, 2);
  } finally { globalThis.localStorage = previous; unsubscribe(); }
});

test("worker edit button lives inside availabilitySection and is absent for create or missing UUID", () => {
  const props = { loginId: "demo", workers: [], workTypeOptions: [], onClose() {}, onSaved() {} };
  const worker = { profileUuid: "worker-1", name: "작업자", phone: "010-1234-5678", noShowCount: 3 };
  const edit = renderToStaticMarkup(React.createElement(WorkerProfileModal, { ...props, mode: "edit", worker }));
  const sectionStart = edit.indexOf("availabilitySection");
  const riskStart = edit.indexOf("workerRiskSetting", sectionStart);
  assert.match(edit.slice(sectionStart, riskStart), /노쇼 이력 관리/);
  assert.match(edit.slice(sectionStart, riskStart), /노쇼 이력 3회/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(WorkerProfileModal, { ...props, mode: "create" })), /노쇼 이력 관리/);
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(WorkerProfileModal, { ...props, mode: "edit", worker: { ...worker, profileUuid: undefined } })), /노쇼 이력 관리/);
});

test("shared history modal supports registered or guest scope without writing on render", () => {
  globalThis.fetch = () => { throw new Error("render must not write"); };
  for (const scope of [{ workerProfileUuid: "worker-1" }, { workDate: "2026-10-25", assignmentUuid: "guest" }]) {
    const html = renderToStaticMarkup(React.createElement(NoShowHistoryModal, { loginId: "demo", ...scope, onClose() {} }));
    assert.match(html, /role="dialog"/);
    assert.match(html, /노쇼 이력 관리/);
    assert.match(html, /작업자 정보의 저장·취소와는 별개/);
    assert.match(html, /이력을 불러오는 중/);
  }
});
