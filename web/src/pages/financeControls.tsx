import { useEffect, useState, type ReactNode } from "react";
import type { Amount } from "../domain/finance";
import type { Cycle, FinanceMode } from "../api/financeApi";
import styles from "./FinancePage.module.css";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.financeFormField}><span>{label}</span>{children}</label>;
}
export function MoneyInput({ label, value, onChange }: { label: string; value: Amount; onChange: (value: Amount) => void }) {
  return <Field label={label}><input inputMode="numeric" placeholder="미입력" value={value ?? ""} onChange={event => {
    const next = event.target.value;
    if (/^\d*$/.test(next)) onChange(next === "" ? null : BigInt(next).toString());
  }} /></Field>;
}
export function QuantityInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const valid = (input: string) => /^\d+(\.\d{1,3})?$/.test(input) && Number(input) > 0 && Number(input) <= 999999.999;
  return <Field label="수량"><input type="number" min="0.001" max="999999.999" step="0.001" required value={text} onChange={event => {
    setText(event.target.value);
    if (valid(event.target.value)) onChange(Number(event.target.value));
  }} onBlur={event => { if (!valid(text)) { event.target.setCustomValidity("수량은 0보다 크게, 소수 셋째 자리까지 입력하세요."); event.target.reportValidity(); setText(String(value)); } else event.target.setCustomValidity(""); }} onInput={event => event.currentTarget.setCustomValidity("")} /></Field>;
}
export function ModeInput({ value, onChange }: { value: FinanceMode; onChange: (mode: FinanceMode) => void }) {
  return <Field label="지급 방식"><select value={value} onChange={event => onChange(event.target.value as FinanceMode)}><option value="OFFICE">사무소 수납·지급</option><option value="DIRECT">농가 → 작업자 직접 지급</option></select></Field>;
}
export function CycleInput({ cycle, weekday, date, onChange }: { cycle: Cycle; weekday: number; date: string | null; onChange: (cycle: Cycle, weekday: number, date: string | null) => void }) {
  return <div className={styles.financeFormGrid}>
    <Field label="지급 주기"><select value={cycle} onChange={event => onChange(event.target.value as Cycle, weekday, date)}><option value="DAILY">당일</option><option value="WEEKLY">주급 · 월~일 작업분, 다음 주 지급</option><option value="CUSTOM">개별 날짜 · 미정 가능</option></select></Field>
    {cycle === "WEEKLY" ? <Field label="다음 주 지급 요일"><select value={weekday} onChange={event => onChange(cycle, Number(event.target.value), date)}>{["월", "화", "수", "목", "금", "토", "일"].map((day, index) => <option value={index + 1} key={day}>{day}요일</option>)}</select></Field> : cycle === "CUSTOM" ? <Field label="지급예정일"><input type="date" value={date ?? ""} onChange={event => onChange(cycle, weekday, event.target.value || null)} /></Field> : null}
  </div>;
}
