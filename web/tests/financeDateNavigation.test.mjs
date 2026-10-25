import assert from "node:assert/strict";
import { after, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

globalThis.window = { location: { hostname: "localhost", port: "5580", protocol: "http:", search: "" }, localStorage: { getItem: () => null } };
const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent", server: { middlewareMode: true } });
const { isValidDateInput, shiftDateRange } = await server.ssrLoadModule("/src/components/dateNavigationHelpers.ts");
const { DateNavigation } = await server.ssrLoadModule("/src/components/DateNavigation.tsx");
const { FinancePage } = await server.ssrLoadModule("/src/pages/FinancePage.tsx");
const { default: financeStyles } = await server.ssrLoadModule("/src/pages/FinancePage.module.css");
after(() => server.close());

test("finance date navigation forwards its page-specific class without changing shared defaults", () => {
  const props = { from: "2026-10-01", to: "2026-10-03", today: "2026-10-25", onChange() {} };
  const base = DateNavigation(props);
  const customized = DateNavigation({ ...props, className: financeStyles.financeDateNavigation });
  assert.equal(customized.props.className, `${base.props.className} ${financeStyles.financeDateNavigation}`);
  const html = renderToStaticMarkup(React.createElement(FinancePage, { loginId: "fiction", onNavigate() {} }));
  assert.ok(html.includes(financeStyles.financePage));
  assert.ok(html.includes(financeStyles.financeDateNavigation));
  assert.ok(html.includes(financeStyles.financeTabBar));
});

test("strict date validation rejects empty, impossible and out-of-bounds input", () => {
  for (const value of ["", "bad", "2026-2-01", "2026-02-29", "2026-04-31", "2026-13-01", "0000-01-01", "10000-01-01"]) assert.equal(isValidDateInput(value), false, value);
  for (const value of ["2024-02-29", "0001-01-01", "0099-12-31", "9999-12-31"]) assert.equal(isValidDateInput(value), true, value);
});

test("one-day filters move a day across month, leap-year and year boundaries", () => {
  for (const [date, expected] of [["2026-10-25", "2026-10-26"], ["2024-02-28", "2024-02-29"], ["2024-02-29", "2024-03-01"], ["2026-12-31", "2027-01-01"]]) {
    assert.deepEqual(shiftDateRange(date, date, 1), { from: expected, to: expected });
    assert.deepEqual(shiftDateRange(expected, expected, -1), { from: date, to: date });
  }
});

test("ranges advance by their inclusive length and round-trip without DST drift", () => {
  for (const [from, to, nextFrom, nextTo] of [
    ["2026-10-01", "2026-10-03", "2026-10-04", "2026-10-06"],
    ["2024-02-28", "2024-03-01", "2024-03-02", "2024-03-04"],
    ["2026-03-07", "2026-03-09", "2026-03-10", "2026-03-12"],
    ["2026-10-31", "2026-11-02", "2026-11-03", "2026-11-05"],
    ["2026-12-30", "2027-01-02", "2027-01-03", "2027-01-06"],
  ]) {
    assert.deepEqual(shiftDateRange(from, to, 1), { from: nextFrom, to: nextTo });
    assert.deepEqual(shiftDateRange(nextFrom, nextTo, -1), { from, to });
  }
});

test("invalid, reversed and overflowing periods have no movement", () => {
  for (const [from, to, direction] of [["", "2026-10-25", 1], ["2026-02-30", "2026-03-01", 1], ["2026-10-26", "2026-10-25", -1], ["0001-01-01", "0001-01-01", -1], ["9999-12-31", "9999-12-31", 1]]) assert.equal(shiftDateRange(from, to, direction), null);
});

const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : node?.props ? [node, ...nodes(node.props.children)] : [];

test("profit period controls render in requested order and today resets both dates", () => {
  const changes = [];
  const tree = DateNavigation({ from: "2026-10-01", to: "2026-10-03", today: "2026-10-25", onChange: (...values) => changes.push(values) });
  const controls = nodes(tree).filter(node => node.type === "button" || node.type === "input");
  assert.deepEqual(controls.map(node => node.type === "input" ? node.props["aria-label"] : node.props.children), ["이전", "작업일 시작", "작업일 종료", "다음", "오늘"]);
  controls[0].props.onClick(); controls[3].props.onClick(); controls[4].props.onClick();
  assert.deepEqual(changes, [["2026-09-28", "2026-09-30"], ["2026-10-04", "2026-10-06"], ["2026-10-25", "2026-10-25"]]);
});

test("empty range input remains editable, disables movement and can recover with today", () => {
  const changes = [];
  const controls = nodes(DateNavigation({ from: "", to: "2026-10-25", today: "2026-10-25", onChange: (...values) => changes.push(values) })).filter(node => node.type === "button" || node.type === "input");
  assert.equal(controls[0].props.disabled, true); assert.equal(controls[3].props.disabled, true);
  controls[0].props.onClick(); controls[3].props.onClick();
  assert.equal(changes.length, 0);
  controls[1].props.onChange({ target: { value: "2026-10-24" } });
  controls[4].props.onClick();
  assert.deepEqual(changes, [["2026-10-24", "2026-10-25"], ["2026-10-25", "2026-10-25"]]);
});

test("single-day controls ignore empty and impossible input instead of propagating invalid dates", () => {
  const changes = [];
  const controls = nodes(DateNavigation({ value: "2026-10-25", today: "2026-10-25", onChange: value => changes.push(value) })).filter(node => node.type === "button" || node.type === "input");
  controls[1].props.onChange({ target: { value: "" } });
  controls[1].props.onChange({ target: { value: "2026-02-30" } });
  assert.deepEqual(changes, []);
  controls[0].props.onClick(); controls[3].props.onClick();
  assert.deepEqual(changes, ["2026-10-24", "2026-10-26"]);
});

test("finance deep-link selects a valid day but rejects impossible dates", () => {
  window.location.search = "?workDate=2024-02-29";
  let html = renderToStaticMarkup(React.createElement(FinancePage, { loginId: "fiction", onNavigate() {} }));
  assert.equal((html.match(/value="2024-02-29"/g) ?? []).length, 2);
  window.location.search = "?workDate=2026-02-30";
  html = renderToStaticMarkup(React.createElement(FinancePage, { loginId: "fiction", onNavigate() {} }));
  assert.ok(!html.includes('value="2026-02-30"'));
  window.location.search = "";
});
