import type { FinanceBalance, FinanceCash } from "../api/financeApi";
import { formatMoney } from "../domain/finance";
import { cashAllocationLabel, cashRecordName } from "./financeCashLabels";
import styles from "./FinancePage.module.css";

export function FinanceCashHistory({
  records,
  balances,
  nameForParty,
  correctionDisabled,
  onAction,
}: {
  records: FinanceCash[];
  balances: FinanceBalance[];
  nameForParty: (partyKey: string) => string;
  correctionDisabled: boolean;
  onAction: (record: FinanceCash, action: "correct" | "cancel") => void;
}) {
  return (
    <>
      {records.map((record) => (
        <article className={styles.financeRecordCard} key={record.uuid}>
          <div className={styles.financeRowHeader}>
            <strong>{cashRecordName(record, nameForParty)}</strong>
            <strong>{formatMoney(record.amount)}</strong>
          </div>
          <span>
            {record.cashDate} ·{" "}
            {record.method === "TRANSFER"
              ? "계좌이체"
              : record.method === "CASH"
                ? "현금"
                : "기타"}
          </span>
          {record.memo ? <p>{record.memo}</p> : null}
          {record.cancelled ? (
            <p className={styles.financeWarningText}>
              취소됨 · {record.cancellationReason} · {record.cancelledAt}
            </p>
          ) : (
            <div className={styles.financeActionGroup}>
              <button
                className={styles.financeSecondaryButton}
                disabled={correctionDisabled}
                type="button"
                onClick={() => onAction(record, "correct")}
              >
                정정
              </button>
              <button
                className={styles.financeDangerButton}
                type="button"
                onClick={() => onAction(record, "cancel")}
              >
                기록 취소
              </button>
            </div>
          )}
          {record.replacesCashUuid ? (
            <span className={styles.financeSecondaryText}>
              정정 원본 {record.replacesCashUuid}
            </span>
          ) : null}
          <details>
            <summary>배분 내역 {record.allocations.length}건</summary>
            <ol className={styles.financeHistoryList}>
              {record.allocations.map((row) => (
                <li key={row.obligationUuid}>
                  {cashAllocationLabel(
                    row,
                    balances.find(
                      (balance) => balance.uuid === row.obligationUuid,
                    ),
                  )}{" "}
                  · {formatMoney(row.amount)}
                </li>
              ))}
            </ol>
          </details>
        </article>
      ))}
    </>
  );
}
