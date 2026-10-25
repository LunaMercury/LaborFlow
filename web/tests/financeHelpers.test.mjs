import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent", server: { middlewareMode: true } });
const { parseAmount, formatMoney, sumMoney, matchesDueDate, dueLabel, validateAllocations, createRetryIdentity, applyDefaults, quantityAmount, localDate, attendanceTime, newFinanceUuid } = await server.ssrLoadModule("/src/domain/finance.ts");
after(() => server.close());

test("missing money is not zero and bigint is never rounded", () => {
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("0"), "0");
  assert.equal(parseAmount("00012"), "12");
  assert.equal(formatMoney(null), "미입력");
  assert.equal(formatMoney("0"), "0원");
  assert.equal(sumMoney(["9007199254740993", "2"]), "9007199254740995");
  for (const value of ["-1", "1.5", "1e3", "Infinity", "abc"]) assert.throws(() => parseAmount(value));
});

test("all debt includes old and unknown due dates independently from profit period", () => {
  for (const due of ["2025-01-01", null, "2027-01-01"]) assert.equal(matchesDueDate(due, "ALL", "2026-10-25"), true);
  assert.equal(matchesDueDate(null, "OVERDUE", "2026-10-25"), false);
  assert.equal(matchesDueDate("2026-10-24", "OVERDUE", "2026-10-25"), true);
  assert.equal(matchesDueDate("2026-10-25", "TODAY", "2026-10-25"), true);
  assert.equal(matchesDueDate("2026-10-26", "FUTURE", "2026-10-25"), true);
  assert.equal(dueLabel(null, "2026-10-25"), "예정일 미정");
});

test("allocations support partial and bulk, reject zero and overpayment", () => {
  assert.equal(validateAllocations([{ amount: "300000", balance: "650000" }]), "300000");
  assert.equal(validateAllocations([{ amount: "10", balance: "10" }, { amount: "20", balance: "40" }]), "30");
  assert.throws(() => validateAllocations([{ amount: "11", balance: "10" }]));
  assert.throws(() => validateAllocations([{ amount: "0", balance: "10" }]));
  assert.throws(() => validateAllocations([]));
});

test("idempotency survives retries and changes with an edited attempted body", () => {
  let sequence = 0;
  const retry = createRetryIdentity(() => `uuid-${++sequence}`);
  assert.equal(retry.forPayload({ amount: "30" }), "uuid-1");
  assert.equal(retry.forPayload({ amount: "30" }), "uuid-1");
  assert.equal(retry.forPayload({ amount: "40" }), "uuid-2");
  retry.reset();
  assert.equal(retry.forPayload({ amount: "40" }), "uuid-3");
});

test("site defaults preserve worker overrides unless explicit overwrite was confirmed", () => {
  const rows = [{ name: "A", area: "women", amount: "140000", overridden: false }, { name: "B", area: "women", amount: "160000", overridden: true }, { name: "C", area: "men", amount: null, overridden: false }];
  const matching = row => row.area === "women";
  const applied = applyDefaults(rows, { amount: "150000" }, matching);
  assert.deepEqual(applied.map(row => row.amount), ["150000", "160000", null]);
  assert.equal(rows[0].amount, "140000");
  assert.deepEqual(applyDefaults(rows, { amount: "150000" }, matching, true).map(row => row.amount), ["150000", "150000", null]);
});

test("quantity previews use integer HALF_UP without automatic attendance prorating", () => {
  assert.equal(quantityAmount("140000", 8), "1120000");
  assert.equal(quantityAmount("160000", 2), "320000");
  assert.equal(sumMoney([quantityAmount("140000", 8), quantityAmount("160000", 2)]), "1440000");
  assert.equal(quantityAmount("1", 0.5), "1");
  assert.equal(quantityAmount("1", 0.499), "0");
  assert.equal(quantityAmount(null, 1), null);
  assert.throws(() => quantityAmount("10", 0));
  assert.throws(() => quantityAmount("10", 1.0001));
});

test("business dates and actual hours use Seoul even when UTC date differs", () => {
  assert.equal(localDate(new Date("2026-10-24T22:00:00Z")), "2026-10-25");
  assert.equal(localDate(new Date("2026-10-25T16:00:00Z")), "2026-10-26");
  assert.equal(attendanceTime("2026-10-24T22:00:00Z"), "07:00");
  assert.equal(attendanceTime("2026-10-24T15:00:00Z"), "00:00");
  assert.equal(attendanceTime(null), "미입력");
  assert.match(newFinanceUuid(), /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
});
