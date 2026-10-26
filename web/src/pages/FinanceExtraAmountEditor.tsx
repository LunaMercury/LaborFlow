import type { FinanceExtra } from "../api/financeApi";
import { formatMoney, newFinanceUuid, quantityAmount } from "../domain/finance";
import {
  removeExtraSide,
  type FinanceAmountSection,
} from "../domain/financeWorkPresentation";
import { Field, MoneyInput, QuantityInput } from "./financeControls";
import styles from "./FinancePage.module.css";

export function FinanceExtraAmountEditor({
  section,
  extras,
  onChange,
}: {
  section: FinanceAmountSection;
  extras: FinanceExtra[];
  onChange: (extras: FinanceExtra[]) => void;
}) {
  const billing = section === "billing";
  const update = (uuid: string, values: Partial<FinanceExtra>) =>
    onChange(
      extras.map((extra) =>
        extra.uuid === uuid ? { ...extra, ...values } : extra,
      ),
    );
  const visible = extras.filter((extra) =>
    billing
      ? extra.chargeRate !== "0" ||
        extra.chargeAmount !== "0" ||
        (extra.costRate === "0" && extra.costAmount === "0")
      : extra.costRate !== "0" || extra.costAmount !== "0",
  );
  return (
    <section className={styles.financeFormSection}>
      <h3>{billing ? "추가 청구" : "사무소 추가 비용"}</h3>
      {billing ? (
        <p className={styles.financeSecondaryText}>
          참값·잔업·보너스 등 · 작업자 지급 금액과 별도
        </p>
      ) : null}
      {visible.map((extra) => (
        <div className={styles.financeExtraAmountRow} key={extra.uuid}>
          <Field label="항목명">
            <input
              value={extra.name}
              onChange={(event) =>
                update(extra.uuid, { name: event.target.value })
              }
            />
          </Field>
          <Field label="계산 기준">
            <select
              value={extra.basis}
              onChange={(event) =>
                update(extra.uuid, {
                  basis: event.target.value as FinanceExtra["basis"],
                })
              }
            >
              <option value="PER_PERSON">인당</option>
              <option value="PER_JOB">건별</option>
            </select>
          </Field>
          <QuantityInput
            value={extra.quantity}
            onChange={(quantity) =>
              update(
                extra.uuid,
                billing
                  ? {
                      quantity,
                      chargeAmount: quantityAmount(extra.chargeRate, quantity),
                    }
                  : {
                      quantity,
                      costAmount: quantityAmount(extra.costRate, quantity),
                    },
              )
            }
          />
          <MoneyInput
            label={billing ? "청구 단가" : "비용 단가"}
            value={billing ? extra.chargeRate : extra.costRate}
            onChange={(rate) =>
              update(
                extra.uuid,
                billing
                  ? {
                      chargeRate: rate,
                      chargeAmount: quantityAmount(rate, extra.quantity),
                    }
                  : {
                      costRate: rate,
                      costAmount: quantityAmount(rate, extra.quantity),
                    },
              )
            }
          />
          <MoneyInput
            label={billing ? "추가 청구액" : "추가 비용"}
            value={billing ? extra.chargeAmount : extra.costAmount}
            onChange={(amount) =>
              update(
                extra.uuid,
                billing ? { chargeAmount: amount } : { costAmount: amount },
              )
            }
          />
          <span className={styles.financeCalculationFormula}>
            {(billing ? extra.chargeAmount : extra.costAmount) !== null &&
            (billing ? extra.chargeAmount : extra.costAmount) !==
              quantityAmount(
                billing ? extra.chargeRate : extra.costRate,
                extra.quantity,
              )
              ? "직접 입력액 적용"
              : `${formatMoney(billing ? extra.chargeRate : extra.costRate)} × ${extra.quantity}${extra.basis === "PER_PERSON" ? "명" : "건"}`}
          </span>
          <button
            className={styles.financeDangerButton}
            type="button"
            onClick={() =>
              onChange(removeExtraSide(extras, extra.uuid, section))
            }
          >
            {billing ? "청구 항목 삭제" : "비용 항목 삭제"}
          </button>
        </div>
      ))}
      <button
        className={styles.financeSecondaryButton}
        type="button"
        onClick={() =>
          onChange([
            ...extras,
            {
              uuid: newFinanceUuid(),
              name: "",
              basis: "PER_JOB",
              quantity: 1,
              chargeRate: billing ? null : "0",
              chargeAmount: billing ? null : "0",
              costRate: billing ? "0" : null,
              costAmount: billing ? "0" : null,
            },
          ])
        }
      >
        {billing ? "추가 청구 항목 +" : "추가 비용 항목 +"}
      </button>
    </section>
  );
}
