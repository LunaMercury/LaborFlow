import type { FinanceLine, FinanceSource } from "../api/financeApi";
import { quantityAmount } from "./finance";

export function scheduleChargeRate(source: FinanceSource, assignmentUuid: string) {
  const area = source.assignments.find(item => item.assignmentUuid === assignmentUuid)?.area;
  return area === "MEN" ? source.maleChargeRate ?? null
    : area === "WOMEN" ? source.femaleChargeRate ?? null : null;
}

export function applyMissingScheduleRates(lines: FinanceLine[], source: FinanceSource) {
  return lines.map(line => {
    if (line.mode !== "OFFICE" || line.override || line.chargeRate !== null || line.chargeAmount !== null) return line;
    const rate = scheduleChargeRate(source, line.assignmentUuid);
    return rate === null ? line : { ...line, chargeRate: rate, chargeAmount: quantityAmount(rate, line.quantity) };
  });
}
