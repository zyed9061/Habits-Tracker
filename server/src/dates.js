// Helpers for local-time `YYYY-MM-DD` dates. Never use toISOString(): it is UTC.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n) => String(n).padStart(2, '0');

/** Formats a Date with its local components as `YYYY-MM-DD`. */
export function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today's local date as `YYYY-MM-DD`. */
export function todayStr() {
  return formatDate(new Date());
}

/** True when `str` is a well-formed, existing calendar date (`2026-02-30` is rejected). */
export function isValidDate(str) {
  if (typeof str !== 'string') return false;
  const m = DATE_RE.exec(str);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** Local Date at midnight for a valid `YYYY-MM-DD` string. */
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Adds `n` calendar days (DST-safe, works on local components). */
export function addDays(str, n) {
  const [y, m, d] = str.split('-').map(Number);
  return formatDate(new Date(y, m - 1, d + n));
}

/** Weekday with 0 = Monday … 6 = Sunday. */
export function weekdayOf(str) {
  return (parseDate(str).getDay() + 6) % 7;
}

/** Inclusive list of dates from `from` to `to` (empty when from > to). */
export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
