import type { FinanceLine } from "../api/financeApi";
import { attendanceTime } from "../domain/finance";
import {
  orderedFinanceLines,
  payoutPlanChange,
  type FinanceAmountSection,
} from "../domain/financeWorkPresentation";
import { Field } from "./financeControls";
import { FinancePayoutPlanInput } from "./FinancePayoutPlanInput";
import {
  FinanceEditableMemoCell,
  FinanceEditableMoneyCell,
} from "./FinanceEditableCell";
import type { FinanceBulkField } from "./FinanceBulkAmountEditor";
import styles from "./FinancePage.module.css";

export function FinanceWorkerAmountTable({
  lines,
  readOnly = false,
  section = "billing",
  sortByName = true,
  workDate = "",
  onChange,
  onBulk,
}: {
  lines: FinanceLine[];
  readOnly?: boolean;
  section?: FinanceAmountSection;
  sortByName?: boolean;
  workDate?: string;
  onChange: (index: number, values: Partial<FinanceLine>) => void;
  onBulk?: (field: FinanceBulkField) => void;
}) {
  const billing = section === "billing";
  return (
    <div className={styles.financeWorkerTableFrame}>
      {onBulk ? (
        <div className={styles.financeMobileBulkToolbar} aria-label="일괄입력">
          {(billing
            ? [["charge", "청구 금액"]]
            : [
                ["pay", "지급금액"],
                ["method", "지급수단"],
                ["due", "지급예정일"],
              ]
          ).map(([field, title]) => (
            <button
              className={styles.financeBulkColumnButton}
              key={field}
              type="button"
              aria-label={`${title} 일괄입력`}
              onClick={() => onBulk(field as FinanceBulkField)}
            >
              {title} ▾
            </button>
          ))}
        </div>
      ) : null}
      <table
        className={[
          styles.financeWorkerAmountTable,
          billing ? styles.financeBillingTable : styles.financePayoutTable,
        ].join(" ")}
      >
        <caption>{billing ? "농가 청구 명단" : "작업자 지급 명단"}</caption>
        <thead>
          <tr>
            <th scope="col">작업자</th>
            {billing ? (
              <>
                <th scope="col">근무시간</th>
                <th scope="col">
                  <div className={styles.financeAmountColumnHeader}>
                    {onBulk ? (
                      <button
                        className={styles.financeBulkColumnButton}
                        type="button"
                        aria-label="청구금액 일괄입력"
                        onClick={() => onBulk("charge")}
                      >
                        ▾ 일괄입력
                      </button>
                    ) : null}
                    <span>청구 금액</span>
                  </div>
                </th>
              </>
            ) : (
              <>
                {(
                  [
                    ["pay", "지급금액"],
                    ["method", "지급수단"],
                    ["due", "지급예정일"],
                  ] as const
                ).map(([field, title]) => (
                  <th key={field} scope="col">
                    <div className={styles.financeAmountColumnHeader}>
                      {onBulk ? (
                        <button
                          className={styles.financeBulkColumnButton}
                          type="button"
                          aria-label={`${title} 일괄입력`}
                          onClick={() => onBulk(field)}
                        >
                          ▾ 일괄입력
                        </button>
                      ) : null}
                      <span>{title}</span>
                    </div>
                  </th>
                ))}
              </>
            )}
            <th scope="col">상세 메모</th>
          </tr>
        </thead>
        <tbody>
          {orderedFinanceLines(lines, sortByName).map(({ line, index }) => (
            <tr key={line.assignmentUuid}>
              <th scope="row">
                <strong>{line.displayName}</strong>
                {line.mode === "DIRECT" ? (
                  <span className={styles.financeStatusBadge}>
                    농가 직접 지급
                  </span>
                ) : null}
              </th>
              {billing ? (
                <>
                  <td data-label="근무시간">
                    {line.actualStartAt || line.actualEndAt
                      ? `${attendanceTime(line.actualStartAt)}~${attendanceTime(line.actualEndAt)}`
                      : "시간 미입력"}
                  </td>
                  <td data-label="청구 금액">
                    <FinanceEditableMoneyCell
                      label={`${line.displayName} 청구 금액 수정`}
                      value={line.chargeAmount}
                      disabled={readOnly}
                      onChange={(chargeAmount) =>
                        onChange(index, { chargeAmount })
                      }
                    />
                  </td>
                </>
              ) : (
                <>
                  <td data-label="지급 금액">
                    <FinanceEditableMoneyCell
                      label={`${line.displayName} 지급 금액 수정`}
                      value={line.payAmount}
                      disabled={readOnly}
                      onChange={(payAmount) => onChange(index, { payAmount })}
                    />
                  </td>
                  <td data-label="지급수단">
                    <FinancePayoutPlanInput
                      showTiming={false}
                      disabled={readOnly}
                      value={line.payoutPlan}
                      onChange={(values) =>
                        onChange(
                          index,
                          payoutPlanChange(line, workDate, values),
                        )
                      }
                    />
                  </td>
                  <td data-label="지급예정일">
                    <FinancePayoutPlanInput
                      showMethod={false}
                      disabled={readOnly}
                      value={line.payoutPlan}
                      onChange={(values) =>
                        onChange(
                          index,
                          payoutPlanChange(line, workDate, values),
                        )
                      }
                    />
                    <Field label="지급 예정일">
                      <input
                        type="date"
                        disabled={readOnly}
                        value={line.payoutDueDate ?? ""}
                        onChange={(event) =>
                          onChange(index, {
                            ...payoutPlanChange(line, workDate, {
                              timing: "CUSTOM",
                            }),
                            payoutDueDate: event.target.value || null,
                          })
                        }
                      />
                    </Field>
                  </td>
                </>
              )}
              <td data-label="상세 메모">
                <FinanceEditableMemoCell
                  label={`${line.displayName} 상세 메모 수정`}
                  value={line.note}
                  disabled={readOnly}
                  onChange={(note) => onChange(index, { note })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!lines.length ? (
        <p className={styles.financeEmptyState}>
          금액을 계산할 근무 확인 기록이 없습니다.
        </p>
      ) : null}
    </div>
  );
}
