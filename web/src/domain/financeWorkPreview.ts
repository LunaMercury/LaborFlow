import type { FinanceExtra, FinanceLine, FinanceSnapshot, FinanceSource, FinanceWork, WorkTotals } from "../api/financeApi";
import { quantityAmount, type Amount } from "./finance";
import { applyMissingScheduleRates, scheduleChargeRate } from "./scheduleFinanceRates";

export function editableFinanceSnapshot(work: FinanceWork) {
  if (!work.snapshot && work.currentSource) return newLocalFinanceSnapshot(work.currentSource);
  if (!work.snapshot || !work.currentSource || work.status !== "DRAFT") return work.snapshot;
  return { ...work.snapshot, lines: applyMissingScheduleRates(work.snapshot.lines, work.currentSource) };
}

export function newLocalFinanceSnapshot(source: FinanceSource): FinanceSnapshot {
  return {
    workDate: source.workDate, clientUuid: source.clientUuid, clientProfileUuid: source.clientProfileUuid,
    clientName: source.clientName, siteUuid: source.siteUuid, siteName: source.siteName, workTitle: source.workTitle,
    sourceFingerprint: source.fingerprint, defaultMode: "OFFICE", defaultChargeRate: null, defaultPayRate: null,
    receiptDueDate: null, lines: schedulePreviewLines(source), extras: [], note: null,
  };
}

export function mergeNewFinanceEdits(base: FinanceSnapshot, edited: FinanceSnapshot, server: FinanceSnapshot): FinanceSnapshot {
  const editableFields = ["mode", "quantity", "chargeRate", "payRate", "chargeAmount", "payAmount", "override", "payoutDueDate", "note", "payoutPlan"] as const;
  if (server.sourceFingerprint !== edited.sourceFingerprint || server.lines.length !== edited.lines.length)
    throw new Error("근태가 변경되었습니다. 입력을 유지한 상태에서 최신 근태를 다시 확인해 주세요.");
  const lines = server.lines.map(line => {
    const before = base.lines.find(row => row.assignmentUuid === line.assignmentUuid);
    const current = edited.lines.find(row => row.assignmentUuid === line.assignmentUuid);
    if (!before || !current) throw new Error("근무 명단이 변경되었습니다. 최신 명단을 다시 확인해 주세요.");
    const changes = Object.fromEntries(editableFields.filter(key => JSON.stringify(before[key]) !== JSON.stringify(current[key])).map(key => [key, current[key]]));
    return { ...line, ...changes };
  });
  return { ...server, lines,
    receiptDueDate: base.receiptDueDate !== edited.receiptDueDate ? edited.receiptDueDate : server.receiptDueDate,
    extras: JSON.stringify(base.extras) !== JSON.stringify(edited.extras) ? edited.extras : server.extras,
    note: base.note !== edited.note ? edited.note : server.note,
  };
}

// A read-only estimate is not a saved draft and does not infer unrecorded wages.
export function schedulePreviewLines(source: FinanceSource | null): FinanceLine[] {
  return (source?.assignments ?? []).filter(row => row.confirmed && row.attendanceStatus === "WORKED" && row.workerCount === 1).map(row => {
    const chargeRate = scheduleChargeRate(source!, row.assignmentUuid);
    return { ...row, mode: "OFFICE", quantity: 1, chargeRate, chargeAmount: quantityAmount(chargeRate, 1),
      payRate: null, payAmount: null, override: false, payoutDueDate: null, note: null };
  });
}

function completeSum(values: Amount[]): Amount {
  return values.some(value => value === null) ? null : values.reduce<bigint>((sum, value) => sum + BigInt(value!), 0n).toString();
}

export function financePreviewTotals(lines: FinanceLine[], extras: FinanceExtra[]): WorkTotals {
  const officeCharge = completeSum([...lines.map(row => row.chargeAmount ?? quantityAmount(row.chargeRate, row.quantity)), ...extras.map(row => row.chargeAmount ?? quantityAmount(row.chargeRate, row.quantity))]);
  const officePay = completeSum(lines.filter(row => row.mode === "OFFICE").map(row => row.payAmount ?? quantityAmount(row.payRate, row.quantity)));
  const directPay = completeSum(lines.filter(row => row.mode === "DIRECT").map(row => row.payAmount ?? quantityAmount(row.payRate, row.quantity)));
  const extraCost = completeSum(extras.map(row => row.costAmount ?? quantityAmount(row.costRate, row.quantity)));
  const workProfit = officeCharge === null || officePay === null || extraCost === null || directPay === null ? null
    : (BigInt(officeCharge) - BigInt(officePay) - BigInt(extraCost)).toString();
  return { officeCharge, officePay, extraCost, workProfit, directPay };
}
