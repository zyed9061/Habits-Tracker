import { parseDateKey, weekdayIndex } from '../dates.js';
import { DEFAULT_LANG, MESSAGES } from '../i18n/messages.js';

// Chaque formateur reçoit les textes `t` de la langue courante (défaut : langue par défaut).
const DEFAULT_T = MESSAGES[DEFAULT_LANG];

// Taux 0..1 -> « 73 % » / "73%" ; null/undefined -> « — ».
export function formatRate(rate, t = DEFAULT_T) {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—';
  return t.percent(Math.round(rate * 100));
}

export const toPercent = (rate) => (rate === null || rate === undefined ? null : Math.round(rate * 1000) / 10);

export const monthShort = (i, t = DEFAULT_T) => t.monthsShort[i];

// « YYYY-MM-DD » -> « 8 oct. » / "Oct 8"
export function formatShortDate(str, t = DEFAULT_T) {
  const d = parseDateKey(str);
  return t.shortDate(d.getDate(), t.monthsShort[d.getMonth()]);
}

// « YYYY-MM-DD » -> « jeudi 8 octobre 2026 » / "Thursday, October 8, 2026"
export function formatFullDate(str, t = DEFAULT_T) {
  const d = parseDateKey(str);
  return t.fullDate(t.weekdaysLong[weekdayIndex(d)], d.getDate(), t.monthsLong[d.getMonth()], d.getFullYear());
}

export const formatCount = (completed, scheduled) => `${completed}/${scheduled}`;
