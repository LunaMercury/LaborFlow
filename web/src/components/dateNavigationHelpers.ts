const DAY_MS = 86_400_000;

function dateTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.getTime() : null;
}

export function isValidDateInput(value: string) {
  return dateTimestamp(value) !== null;
}

export function shiftDateRange(from: string, to: string, direction: -1 | 1) {
  const start = dateTimestamp(from);
  const end = dateTimestamp(to);
  if (start === null || end === null || start > end) return null;
  const offset = (end - start + DAY_MS) * direction;
  const nextFrom = new Date(start + offset).toISOString().slice(0, 10);
  const nextTo = new Date(end + offset).toISOString().slice(0, 10);
  return isValidDateInput(nextFrom) && isValidDateInput(nextTo)
    ? { from: nextFrom, to: nextTo } : null;
}
