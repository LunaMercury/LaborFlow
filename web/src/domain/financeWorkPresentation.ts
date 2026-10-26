import type { FinanceExtra, FinanceLine, FinanceSource, PayoutPlan } from "../api/financeApi";
import { quantityAmount, type Amount } from "./finance";
import { shiftDateRange } from "../components/dateNavigationHelpers";

export type FinanceAmountSection = "billing" | "payout";
const financeNameCollator = new Intl.Collator("ko", { numeric: true });
export function orderedFinanceLines(lines: FinanceLine[], sortByName: boolean) {
  const rows = lines.map((line, index) => ({ line, index }));
  return sortByName ? rows.sort((a, b) => financeNameCollator.compare(a.line.displayName, b.line.displayName) || a.index - b.index) : rows;
}

export function payoutPlanChange(line: FinanceLine, workDate: string, values: Partial<PayoutPlan>): Partial<FinanceLine> {
  const payoutPlan = { method: line.payoutPlan?.method ?? null, timing: line.payoutPlan?.timing ?? null, ...values };
  let payoutDueDate = line.payoutDueDate;
  if (values.timing === "SAME_DAY") payoutDueDate = workDate;
  if (values.timing === "AFTER_7_DAYS") {
    let date = workDate;
    for (let day = 0; day < 7; day++) date = shiftDateRange(date, date, 1)?.from ?? date;
    payoutDueDate = date;
  }
  return { payoutPlan, payoutDueDate };
}

export function applyFinanceBulk(lines: FinanceLine[], source: FinanceSource | null, group: string, includeOverrides: boolean, values: (line: FinanceLine) => Partial<FinanceLine>) {
  return lines.map(line => (group === "ALL" || source?.assignments.some(row => row.assignmentUuid === line.assignmentUuid && row.area === group)) && (!line.override || includeOverrides)
    ? { ...line, ...values(line) } : line);
}

export function billingBreakdown(lines: FinanceLine[], extras: FinanceExtra[]) {
  const grouped = new Map<string, { name: string; rate: Amount; quantity: number; amount: Amount }>();
  for (const line of lines) {
    const amount = line.chargeAmount ?? quantityAmount(line.chargeRate, line.quantity);
    const standard = line.quantity === 1 && amount === line.chargeRate;
    const name = line.mode === "DIRECT" ? "사무소 소개료" : standard ? "일당" : "조정 청구액";
    const key = JSON.stringify([name, amount]);
    const previous = grouped.get(key);
    if (previous) { previous.quantity++; previous.amount = amount === null ? null : (BigInt(amount) * BigInt(previous.quantity)).toString(); }
    else grouped.set(key, { name, rate: amount, quantity: 1, amount });
  }
  return [...grouped.values(), ...extras.filter(extra => extra.chargeAmount !== "0" || extra.chargeRate !== "0").map(extra => ({ name: extra.name || "추가 청구", rate: extra.chargeRate, quantity: extra.quantity, amount: extra.chargeAmount ?? quantityAmount(extra.chargeRate, extra.quantity) }))];
}

export function removeExtraSide(extras: FinanceExtra[], uuid: string, section: FinanceAmountSection) {
  return extras.flatMap(extra => {
    if (extra.uuid !== uuid) return [extra];
    const next = section === "billing" ? { ...extra, chargeRate: "0", chargeAmount: "0" } : { ...extra, costRate: "0", costAmount: "0" };
    return next.chargeAmount === "0" && next.costAmount === "0" ? [] : [next];
  });
}
