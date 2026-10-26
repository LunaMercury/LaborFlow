import { useState } from "react";
import type { FinanceLine, FinanceSource, PayoutPlan } from "../api/financeApi";
import type { Amount } from "../domain/finance";
import {
  applyFinanceBulk,
  payoutPlanChange,
} from "../domain/financeWorkPresentation";
import { Field, MoneyInput } from "./financeControls";
import { FinancePayoutPlanInput } from "./FinancePayoutPlanInput";
import { HistoryDialog } from "../components/AssignmentHistoryModal";
import { isValidDateInput } from "../components/dateNavigationHelpers";
import styles from "./FinancePage.module.css";

export type FinanceBulkField = "charge" | "pay" | "method" | "due";
const titles: Record<FinanceBulkField, string> = {
  charge: "청구금액 일괄입력",
  pay: "지급금액 일괄입력",
  method: "지급수단 일괄입력",
  due: "지급예정일 일괄입력",
};

export function FinanceBulkAmountEditor({
  field,
  lines,
  source,
  workDate,
  onChange,
  onClose,
}: {
  field: FinanceBulkField;
  lines: FinanceLine[];
  source: FinanceSource | null;
  workDate: string;
  onChange: (lines: FinanceLine[]) => void;
  onClose: () => void;
}) {
  const [group, setGroup] = useState("ALL");
  const [includeOverrides, setIncludeOverrides] = useState(true);
  const [amount, setAmount] = useState<Amount>(null);
  const [plan, setPlan] = useState<PayoutPlan>({
    method: null,
    timing: "CUSTOM",
  });
  const [date, setDate] = useState(workDate);
  const money = field === "charge" || field === "pay";
  const valid = money
    ? amount !== null && BigInt(amount) <= 999999999999n
    : field === "method"
      ? plan.method !== null
      : plan.timing !== null &&
        (plan.timing !== "CUSTOM" || isValidDateInput(date));
  const apply = () => {
    if (!valid) return;
    const values = (line: FinanceLine): Partial<FinanceLine> =>
      field === "charge"
        ? { chargeAmount: amount }
        : field === "pay"
          ? { payAmount: amount }
          : field === "method"
            ? payoutPlanChange(line, workDate, { method: plan.method })
            : {
                ...payoutPlanChange(line, workDate, { timing: plan.timing }),
                ...(plan.timing === "CUSTOM" ? { payoutDueDate: date } : {}),
              };
    onChange(applyFinanceBulk(lines, source, group, includeOverrides, values));
    onClose();
  };
  return (
    <HistoryDialog
      title={titles[field]}
      onClose={onClose}
      className={styles.financeBulkInputDialog}
    >
      <div className={styles.financeBulkInputDialogBody}>
        {money ? (
          <div className={styles.financeBulkMoneyField}>
            <MoneyInput
              label={field === "pay" ? "지급금액" : "청구금액"}
              value={amount}
              onChange={setAmount}
              formatThousands
            />
            <span>원</span>
          </div>
        ) : (
          <FinancePayoutPlanInput
            value={plan}
            showMethod={field === "method"}
            showTiming={field === "due"}
            onChange={(values) =>
              setPlan((current) => ({ ...current, ...values }))
            }
          />
        )}
        {field === "due" && plan.timing === "CUSTOM" ? (
          <Field label="지급 예정일">
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        ) : null}
        {field === "due" && plan.timing === "AFTER_COLLECTION" ? (
          <p className={styles.financeSecondaryText}>
            기존 예정일은 유지하며 실제 지급을 제한하지 않습니다.
          </p>
        ) : null}
        <details className={styles.financeBulkInputOptions}>
          <summary>적용 대상</summary>
          <Field label="적용 대상">
            <select
              value={group}
              onChange={(event) => setGroup(event.target.value)}
            >
              <option value="ALL">전체 작업자</option>
              <option value="MEN">남자 배치</option>
              <option value="WOMEN">여자 배치</option>
            </select>
          </Field>
          <label className={styles.financeCheckboxField}>
            <input
              type="checkbox"
              checked={includeOverrides}
              onChange={(event) => setIncludeOverrides(event.target.checked)}
            />
            개별 수정된 행에도 적용
          </label>
        </details>
        <div className={styles.financeBulkInputDialogActions}>
          <button
            className={styles.financeSecondaryButton}
            type="button"
            onClick={onClose}
          >
            닫기
          </button>
          <button
            className={styles.financePrimaryButton}
            disabled={!valid}
            type="button"
            onClick={apply}
          >
            일괄입력
          </button>
        </div>
      </div>
    </HistoryDialog>
  );
}
