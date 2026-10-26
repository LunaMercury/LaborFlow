import type {
  CashAllocation,
  FinanceBalance,
  FinanceCash,
} from "../api/financeApi";

export function cashRecordName(
  record: FinanceCash,
  fallback: (partyKey: string) => string,
) {
  return record.partyName?.trim() || fallback(record.partyKey);
}

export function cashAllocationLabel(
  allocation: CashAllocation,
  balance?: FinanceBalance,
) {
  const values = [
    allocation.workDate?.trim() || balance?.workDate,
    allocation.siteName?.trim() || balance?.siteName,
    allocation.clientName?.trim() || balance?.clientName,
  ].filter(Boolean);
  return values.length
    ? values.join(" · ")
    : `기존 배분 · ${allocation.obligationUuid}`;
}
