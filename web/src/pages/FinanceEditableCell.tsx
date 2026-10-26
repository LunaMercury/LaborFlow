import { useRef, useState } from "react";
import { formatMoney, type Amount } from "../domain/finance";
import styles from "./FinancePage.module.css";

export function FinanceEditableMoneyCell({
  value,
  label,
  disabled,
  onChange,
}: {
  value: Amount;
  label: string;
  disabled?: boolean;
  onChange: (value: Amount) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const active = useRef(false);
  const finish = () => {
    if (!active.current) return;
    active.current = false;
    onChange(text === "" ? null : BigInt(text).toString());
    setEditing(false);
  };
  return editing ? (
    <input
      className={styles.financeInlineMoneyInput}
      aria-label={label}
      inputMode="numeric"
      autoFocus
      value={text}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const next = event.target.value.replace(/,/g, "");
        if (/^\d*$/.test(next)) setText(next);
      }}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          event.preventDefault();
          active.current = false;
          setEditing(false);
        } else if (event.key === "Enter") {
          event.preventDefault();
          finish();
        }
      }}
    />
  ) : (
    <button
      className={styles.financeEditableCellButton}
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={() => {
        active.current = true;
        setText(value ?? "");
        setEditing(true);
      }}
    >
      {value === null ? "입력" : formatMoney(value).replace(/원$/, "")}
    </button>
  );
}

export function FinanceEditableMemoCell({
  value,
  label,
  disabled,
  onChange,
}: {
  value: string | null;
  label: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const active = useRef(false);
  const finish = () => {
    if (!active.current) return;
    active.current = false;
    onChange(text.trim() ? text : null);
    setEditing(false);
  };
  return editing ? (
    <textarea
      className={styles.financeInlineMemoInput}
      aria-label={label}
      maxLength={1000}
      rows={3}
      autoFocus
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          event.preventDefault();
          active.current = false;
          setEditing(false);
        } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          finish();
        }
      }}
    />
  ) : (
    <button
      className={styles.financeEditableCellButton}
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={() => {
        active.current = true;
        setText(value ?? "");
        setEditing(true);
      }}
    >
      {value || "-"}
    </button>
  );
}
