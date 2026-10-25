import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
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

test("attendance owns the bulk planned-work action and disables it until records load", () => {
  const html = renderToStaticMarkup(React.createElement(AttendancePage, { loginId: "fiction", onNavigate() {} }));
  assert.match(html, /<button[^>]*disabled=""[^>]*>모두 예정대로<\/button>/);
});

test("assignment page keeps attendance navigation but no date or week attendance confirmations", () => {
  const html = renderToStaticMarkup(React.createElement(WorkSchedulePage, { loginId: "fiction", onNavigate() {} }));
  assert.ok(html.includes("근태 관리"));
  assert.ok(!html.includes("예정대로"));
});

test("planned-work confirmation sends only the selected office and date, returning the server count", async () => {
  const previous = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: new URL(String(url)), init });
    return Response.json({ confirmedCount: 2 });
  };
  try {
    assert.equal(await confirmPlannedAttendance("fiction office", { scope: "DATE", workDate: "2026-10-24" }), 2);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url.pathname, "/api/attendance/confirm-planned");
    assert.equal(requests[0].url.searchParams.get("loginId"), "fiction office");
    assert.equal(requests[0].init.method, "POST");
    assert.deepEqual(JSON.parse(requests[0].init.body), { scope: "DATE", workDate: "2026-10-24" });
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
  const payload = { scope: "DATE", workDate: "2026-10-24" };
  try {
    await assert.rejects(() => confirmPlannedAttendance("fiction", payload), /예정 근무를 확정하지 못했습니다/);
    assert.equal(await confirmPlannedAttendance("fiction", payload), 0);
    assert.deepEqual(bodies, [JSON.stringify(payload), JSON.stringify(payload)]);
  } finally { globalThis.fetch = previous; }
});
