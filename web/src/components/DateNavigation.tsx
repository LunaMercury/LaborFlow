import { isValidDateInput, shiftDateRange } from "./dateNavigationHelpers";
import styles from "./DateNavigation.module.css";

type DateNavigationProps = { className?: string } & ({
  value: string;
  today: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  inputLabel?: string;
} | {
  from: string;
  to: string;
  today: string;
  onChange: (from: string, to: string) => void;
  disabled?: boolean;
});

export function DateNavigation(props: DateNavigationProps) {
  const isRange = "from" in props;
  const from = isRange ? props.from : props.value;
  const to = isRange ? props.to : props.value;
  const previous = shiftDateRange(from, to, -1);
  const next = shiftDateRange(from, to, 1);
  const changeRange = (range: ReturnType<typeof shiftDateRange>) => {
    if (!range || props.disabled) return;
    if ("from" in props) props.onChange(range.from, range.to);
    else props.onChange(range.from);
  };
  const todayButton = <button className={styles.moveButton} type="button" disabled={props.disabled} onClick={() => changeRange({ from: props.today, to: props.today })}>오늘</button>;

  return <div className={[styles.bar, props.className].filter(Boolean).join(" ")}>
    <div className={`${styles.control} ${isRange ? styles.range : styles.single}`} role="group" aria-label={isRange ? "작업일 기간" : "작업일 선택"}>
      {!isRange ? <span className={styles.label}>작업일</span> : null}
      <button className={styles.moveButton} type="button" title={isRange ? "이전 기간" : "이전 작업일"} aria-label={isRange ? "이전 기간" : "이전 작업일"} disabled={props.disabled || !previous} onClick={() => changeRange(previous)}>{isRange ? "이전" : "◀ 어제"}</button>
      {"from" in props ? <>
        <input className={styles.dateInput} aria-label="작업일 시작" type="date" min="0001-01-01" max="9999-12-31" disabled={props.disabled} value={props.from} onChange={event => props.onChange(event.target.value, props.to)} />
        <input className={styles.dateInput} aria-label="작업일 종료" type="date" min="0001-01-01" max="9999-12-31" disabled={props.disabled} value={props.to} onChange={event => props.onChange(props.from, event.target.value)} />
      </> : <input className={styles.dateInput} aria-label={props.inputLabel ?? "작업일"} type="date" min="0001-01-01" max="9999-12-31" disabled={props.disabled} value={props.value} onChange={event => { if (isValidDateInput(event.target.value)) props.onChange(event.target.value); }} />}
      {!isRange ? todayButton : null}
      <button className={styles.moveButton} type="button" title={isRange ? "다음 기간" : "다음 작업일"} aria-label={isRange ? "다음 기간" : "다음 작업일"} disabled={props.disabled || !next} onClick={() => changeRange(next)}>{isRange ? "다음" : "내일 ▶"}</button>
      {isRange ? todayButton : null}
    </div>
  </div>;
}
