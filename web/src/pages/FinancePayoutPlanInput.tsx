import type { PayoutPlan } from "../api/financeApi";
import { Field } from "./financeControls";

export function FinancePayoutPlanInput({
  value,
  onChange,
  showMethod = true,
  showTiming = true,
  disabled,
}: {
  value?: PayoutPlan | null;
  onChange: (values: Partial<PayoutPlan>) => void;
  showMethod?: boolean;
  showTiming?: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      {showMethod ? (
        <Field label="지급 수단">
          <select
            disabled={disabled}
            value={value?.method ?? ""}
            onChange={(event) =>
              onChange({
                method: (event.target.value as PayoutPlan["method"]) || null,
              })
            }
          >
            <option value="">미지정</option>
            <option value="CASH">현금</option>
            <option value="TRANSFER">송금</option>
          </select>
        </Field>
      ) : null}
      {showTiming ? (
        <Field label="지급 시기">
          <select
            disabled={disabled}
            value={value?.timing ?? ""}
            onChange={(event) =>
              onChange({
                timing: (event.target.value as PayoutPlan["timing"]) || null,
              })
            }
          >
            <option value="">미지정</option>
            <option value="SAME_DAY">당일 지급</option>
            <option value="AFTER_7_DAYS">7일 뒤 지급</option>
            <option value="AFTER_COLLECTION">수금 후 지급</option>
            <option value="CUSTOM">날짜 지정</option>
          </select>
        </Field>
      ) : null}
    </>
  );
}
