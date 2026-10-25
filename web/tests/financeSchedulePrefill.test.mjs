import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent", server: { middlewareMode: true } });
const { scheduleChargeRate, applyMissingScheduleRates } = await server.ssrLoadModule("/src/domain/scheduleFinanceRates.ts");
const { parseFinanceJson } = await server.ssrLoadModule("/src/api/financeApi.ts");
after(() => server.close());
const source = { maleChargeRate: "160000", femaleChargeRate: "140000", assignments: [{ assignmentUuid: "m", area: "MEN" }, { assignmentUuid: "w", area: "WOMEN" }] };
const line = (assignmentUuid, extra = {}) => ({ assignmentUuid, mode: "OFFICE", quantity: 1, chargeRate: null, chargeAmount: null, payRate: "100000", payAmount: "100000", override: false, ...extra });

test("schedule money is parsed exactly and missing differs from explicit zero", () => {
  assert.deepEqual(parseFinanceJson('{"maleChargeRate":160000,"femaleChargeRate":0}'), { maleChargeRate: "160000", femaleChargeRate: "0" });
  assert.equal(scheduleChargeRate(source, "m"), "160000");
  assert.equal(scheduleChargeRate(source, "w"), "140000");
  assert.equal(scheduleChargeRate(source, "unknown"), null);
});

test("explicitly filling blanks respects assignment areas, zero, pay and overrides", () => {
  const rows = [line("m"), line("w"), line("m", { override: true }), line("m", { chargeAmount: "0" }), line("w", { mode: "DIRECT" })];
  const result = applyMissingScheduleRates(rows, source);
  assert.deepEqual(result.map(row => row.chargeRate), ["160000", "140000", null, null, null]);
  assert.equal(result[0].payAmount, "100000");
  assert.equal(rows[0].chargeAmount, null);
  assert.equal(result[2], rows[2]);
  assert.equal(result[3], rows[3]);
  assert.equal(result[4], rows[4]);
  assert.equal(applyMissingScheduleRates([line("m")], { ...source, maleChargeRate: "0" })[0].chargeAmount, "0");
});
