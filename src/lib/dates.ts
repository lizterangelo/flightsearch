/**
 * Calendar-date helpers anchored to LOCAL time. Never use
 * `new Date().toISOString()` for "today" — that's the UTC calendar date and
 * is one day off for evening users west of UTC.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function todayLocalYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
