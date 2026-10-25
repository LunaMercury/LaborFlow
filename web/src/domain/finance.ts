export type Amount = string | null;
export type DueFilter = "ALL" | "TODAY" | "OVERDUE" | "FUTURE";

export function parseAmount(value: string): Amount {
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (!/^\d+$/.test(cleaned)) throw new Error("금액은 0 이상의 원 단위 정수로 입력하세요.");
  return BigInt(cleaned).toString();
}

export function formatMoney(value: Amount | undefined) {
  return value == null ? "미입력" : `${BigInt(value).toLocaleString("ko-KR")}원`;
}

export function sumMoney(values: string[]) {
  return values.reduce((sum, value) => sum + BigInt(value), 0n).toString();
}

export function quantityAmount(rate: Amount, quantity: number): Amount {
  if (rate === null) return null;
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999.999 || !/^\d+(\.\d{1,3})?$/.test(String(quantity))) throw new Error("수량은 0보다 크게, 소수 셋째 자리까지 입력하세요.");
  const [whole, fraction = ""] = String(quantity).split(".");
  const scaled = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  return ((BigInt(rate) * scaled + 500n) / 1000n).toString();
}

export function localDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function attendanceTime(value: string | null) {
  if (!value) return "미입력";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "시간 확인 필요" : new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

export function matchesDueDate(dueDate: string | null, filter: DueFilter, today: string) {
  if (filter === "ALL") return true;
  if (!dueDate) return false;
  if (filter === "TODAY") return dueDate === today;
  return filter === "OVERDUE" ? dueDate < today : dueDate > today;
}

export function dueLabel(dueDate: string | null, today: string) {
  if (!dueDate) return "예정일 미정";
  return `${dueDate}${dueDate < today ? " · 기한 경과" : dueDate === today ? " · 오늘 예정" : " · 예정"}`;
}

export function validateAllocations(rows: { amount: string; balance: string }[]) {
  if (!rows.length) throw new Error("배분할 내역을 선택하세요.");
  for (const row of rows) {
    const value = parseAmount(row.amount);
    if (value === null || BigInt(value) <= 0n) throw new Error("배분 금액은 0원보다 커야 합니다.");
    if (BigInt(value) > BigInt(row.balance)) throw new Error("잔액을 초과한 배분과 선급금은 지원하지 않습니다.");
  }
  return sumMoney(rows.map(row => parseAmount(row.amount)!));
}

// A request whose response was lost must keep its key, but changed payloads must not.
export function newFinanceUuid() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createRetryIdentity(makeUuid = newFinanceUuid) {
  let fingerprint: string | null = null;
  let key = "";
  return {
    forPayload(payload: unknown) {
      const next = JSON.stringify(payload);
      if (next !== fingerprint) { fingerprint = next; key = makeUuid(); }
      return key;
    },
    reset() { fingerprint = null; key = ""; },
  };
}

export function applyDefaults<T extends { overridden: boolean }>(
  rows: T[], values: Partial<T>, matches: (row: T) => boolean, overwrite = false,
) {
  return rows.map(row => matches(row) && (!row.overridden || overwrite)
    ? { ...row, ...values, overridden: false } : row);
}
