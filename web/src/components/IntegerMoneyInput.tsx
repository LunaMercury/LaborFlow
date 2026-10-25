import { useLayoutEffect, useRef } from "react";

export const MAX_INTEGER_MONEY = 999_999_999_999;

export function parseIntegerMoneyInput(text: string): number | null | undefined {
  if (text === "") return null;
  if (!/^[\d,]+$/.test(text)) return undefined;
  const digits = text.replace(/,/g, "");
  if (!digits) return undefined;
  const value = Number(digits);
  return Number.isSafeInteger(value) && value <= MAX_INTEGER_MONEY ? value : undefined;
}

export function formatIntegerMoneyInput(value: number | null): string {
  return value === null ? "" : value.toLocaleString("ko-KR");
}

type IntegerMoneyInputProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
};

export function IntegerMoneyInput({ value, onChange, disabled }: IntegerMoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingDigits = useRef<number | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || pendingDigits.current === null) return;
    // Keep the caret beside the edited digit when comma formatting changes length.
    let position = 0;
    let remaining = pendingDigits.current;
    while (position < input.value.length && remaining > 0) {
      if (/\d/.test(input.value[position])) remaining -= 1;
      position += 1;
    }
    input.setSelectionRange(position, position);
    pendingDigits.current = null;
  });

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="미입력"
      disabled={disabled}
      value={formatIntegerMoneyInput(value)}
      onChange={(event) => {
        const input = event.currentTarget;
        const next = parseIntegerMoneyInput(input.value);
        if (next === undefined) return;
        pendingDigits.current = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, "").length;
        onChange(next);
      }}
    />
  );
}
