import { getApiBaseUrl } from "./apiBaseUrl";
import { parseErrorMessage } from "./parseErrorMessage";
import type { Amount, DueFilter } from "../domain/finance";

export type FinanceMode = "OFFICE" | "DIRECT";
export type CashKind = "RECEIPT" | "PAYOUT" | "DIRECT";
export type Cycle = "DAILY" | "WEEKLY" | "CUSTOM";
export type FinanceAssignment = {
  assignmentUuid: string; workerProfileUuid: string | null; payeeKey: string;
  displayName: string; assignmentStatus: string; attendanceStatus: string;
  confirmed: boolean; workerCount: number; actualStartAt: string | null; actualEndAt: string | null; breakMinutes: number | null;
};
export type FinanceLine = Omit<FinanceAssignment, "assignmentStatus" | "confirmed" | "workerCount"> & {
  mode: FinanceMode; quantity: number; chargeRate: Amount; payRate: Amount;
  chargeAmount: Amount; payAmount: Amount; override: boolean; payoutDueDate: string | null; note: string | null;
};
export type FinanceExtra = {
  uuid: string; name: string; basis: "PER_PERSON" | "PER_JOB"; quantity: number;
  chargeRate: Amount; costRate: Amount; chargeAmount: Amount; costAmount: Amount;
};
export type FinanceSource = {
  scheduleDayUuid: string; workDate: string; clientUuid: string; clientProfileUuid: string; clientName: string;
  siteUuid: string; siteName: string; workTitle: string; active: boolean;
  fingerprint: string; attendanceReady: boolean; assignments: FinanceAssignment[];
};
export type FinanceSnapshot = Omit<FinanceSource, "active" | "fingerprint" | "attendanceReady" | "assignments" | "scheduleDayUuid"> & {
  sourceFingerprint: string; defaultMode: FinanceMode; defaultChargeRate: Amount;
  defaultPayRate: Amount; receiptDueDate: string | null; lines: FinanceLine[];
  extras: FinanceExtra[]; note: string | null;
};
export type WorkTotals = { officeCharge: Amount; officePay: Amount; extraCost: Amount; workProfit: Amount; directPay: Amount };
export type FinanceWork = {
  uuid: string | null; scheduleDayUuid: string; version: number; status: "UNPREPARED" | "DRAFT" | "CONFIRMED";
  sourceStatus: "READY" | "ATTENDANCE_UNCONFIRMED" | "NO_WORKED_ATTENDANCE" | "UNAVAILABLE";
  reviewRequired: boolean; currentSource: FinanceSource | null; snapshot: FinanceSnapshot | null; totals: WorkTotals;
  revisions: { version: number; status: string; reason: string | null; changedAt: string; changedByAccountUuid: string; snapshot: FinanceSnapshot }[];
};
export type WorkList = { items: FinanceWork[]; summary: WorkTotals & { confirmedCount: number; unconfirmedCount: number; reviewCount: number; workerDayCount: number; uniqueWorkerCount: number; guestAttendanceCount: number } };
export type WorkPayload = Pick<FinanceSnapshot, "defaultMode" | "defaultChargeRate" | "defaultPayRate" | "receiptDueDate" | "extras" | "note"> & {
  lines: Pick<FinanceLine, "assignmentUuid" | "mode" | "quantity" | "chargeRate" | "payRate" | "chargeAmount" | "payAmount" | "override" | "payoutDueDate" | "note">[];
  version: number; status: "DRAFT" | "CONFIRMED"; reason: string | null; sourceFingerprint: string;
};
export type FinanceBalance = {
  uuid: string; workUuid: string; scheduleDayUuid: string; workDate: string; kind: CashKind;
  partyKey: string; partyName: string; clientName: string; siteName: string; assignmentUuid: string | null;
  amount: string; settledAmount: string; outstandingAmount: string; originalDueDate: string | null; dueDate: string | null;
  status: "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID"; overdue: boolean; reconciliationRequired: boolean; relatedReceiptOutstanding: Amount;
};
export type BalanceList = { items: FinanceBalance[]; totalAmount: string; totalSettled: string; totalOutstanding: string };
export type CashAllocationInput = { obligationUuid: string; amount: string };
export type CashAllocation = CashAllocationInput & {
  readonly workDate?: string | null; readonly siteName?: string | null; readonly clientName?: string | null;
};
export type CashPayload = { kind: CashKind; partyKey: string; cashDate: string; amount: string; method: "CASH" | "TRANSFER" | "OTHER"; memo: string | null; allocations: CashAllocationInput[] };
export type FinanceCash = Omit<CashPayload, "allocations"> & {
  allocations: CashAllocation[]; readonly partyName?: string | null;
  uuid: string; createdAt: string; createdByAccountUuid: string; cancelled: boolean; cancellationReason: string | null;
  cancelledAt: string | null; replacesCashUuid: string | null;
};
export type WorkerFinanceOverride = { workerProfileUuid: string; defaultMode: FinanceMode | null; chargeRate: Amount; payRate: Amount; payoutCycle: Cycle; weeklyPayday: number; customDueDate: string | null };
export type ClientFinanceOverride = { clientProfileUuid: string; defaultMode: FinanceMode | null; chargeRate: Amount; payRate: Amount };
export type FinanceSettings = { version: number; defaultMode: FinanceMode; defaultChargeRate: Amount; defaultPayRate: Amount; payoutCycle: Cycle; weeklyPayday: number; customDueDate: string | null; workerOverrides: WorkerFinanceOverride[]; clientOverrides: ClientFinanceOverride[] };

const monetaryKeys = new Set(["amount", "chargeRate", "payRate", "costRate", "defaultChargeRate", "defaultPayRate", "chargeAmount", "payAmount", "costAmount", "officeCharge", "officePay", "extraCost", "workProfit", "directPay", "settledAmount", "outstandingAmount", "totalAmount", "totalSettled", "totalOutstanding", "relatedReceiptOutstanding"]);

export function parseFinanceJson(input: string): unknown {
  return JSON.parse(input, (key, value) => {
    if (!monetaryKeys.has(key) || value == null) return value;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || Math.abs(value) > 999999999999) throw new Error("서버 금액 범위를 확인하세요.");
    return String(value);
  });
}

export function stringifyFinanceJson(value: unknown): string {
  return JSON.stringify(value, (key, item) => {
    if (!monetaryKeys.has(key) || item == null) return item;
    if (typeof item !== "string" || !/^-?\d+$/.test(item)) throw new Error("금액은 원 단위 정수여야 합니다.");
    const number = Number(item);
    if (!Number.isSafeInteger(number) || Math.abs(number) > 999999999999) throw new Error("금액은 999,999,999,999원 이하여야 합니다.");
    return number;
  });
}

async function request<T>(loginId: string, path: string, method = "GET", payload?: unknown, filters: Record<string, string | undefined> = {}): Promise<T> {
  const query = new URLSearchParams({ loginId });
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
  const response = await fetch(`${getApiBaseUrl()}/api/finance${path}?${query}`, {
    method, cache: "no-store", ...(payload === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: stringifyFinanceJson(payload) }),
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response, "정산 요청을 처리하지 못했습니다. 다시 조회한 후 확인하세요."));
  return parseFinanceJson(await response.text()) as T;
}

export const fetchFinanceWork = (loginId: string, fromDate: string, toDate: string) => request<WorkList>(loginId, "/work", "GET", undefined, { fromDate, toDate });
export const fetchFinanceDetail = (loginId: string, uuid: string) => request<FinanceWork>(loginId, `/work/${encodeURIComponent(uuid)}`);
export const prepareFinanceWork = (loginId: string, scheduleDayUuid: string) => request<FinanceWork>(loginId, `/work/${encodeURIComponent(scheduleDayUuid)}/prepare`, "POST");
export const saveFinanceWork = (loginId: string, uuid: string, payload: WorkPayload) => request<FinanceWork>(loginId, `/work/${encodeURIComponent(uuid)}`, "PUT", payload);
export const fetchFinanceBalances = (loginId: string, kind: CashKind, filter: DueFilter = "ALL") => request<BalanceList>(loginId, "/balances", "GET", undefined, { kind, filter });
export const fetchFinanceCash = (loginId: string, kind: CashKind, fromDate: string, toDate: string) => request<{ items: FinanceCash[] }>(loginId, "/cash", "GET", undefined, { kind, fromDate, toDate });
function cashWritePayload(payload: CashPayload): CashPayload {
  const { kind, partyKey, cashDate, amount, method, memo } = payload;
  return { kind, partyKey, cashDate, amount, method, memo, allocations: payload.allocations.map(({ obligationUuid, amount }) => ({ obligationUuid, amount })) };
}

export const createFinanceCash = (loginId: string, requestId: string, payload: CashPayload) => request<FinanceCash>(loginId, "/cash", "POST", { requestId, ...cashWritePayload(payload) });
export const cancelFinanceCash = (loginId: string, uuid: string, requestId: string, reason: string) => request<FinanceCash>(loginId, `/cash/${encodeURIComponent(uuid)}/cancel`, "POST", { requestId, reason });
export const correctFinanceCash = (loginId: string, uuid: string, requestId: string, reason: string, replacement: CashPayload) => request<FinanceCash>(loginId, `/cash/${encodeURIComponent(uuid)}/correct`, "POST", { requestId, reason, replacement: cashWritePayload(replacement) });
export const fetchFinanceSettings = (loginId: string) => request<FinanceSettings>(loginId, "/settings");
export const saveFinanceSettings = (loginId: string, settings: FinanceSettings, reason: string) => request<FinanceSettings>(loginId, "/settings", "PUT", { ...settings, reason });
