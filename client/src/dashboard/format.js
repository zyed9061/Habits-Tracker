import { WEEKDAY_LONG, WEEKDAY_SHORT, parseDateKey, toDateKey, weekdayIndex } from '../dates.js';

// Dates « YYYY-MM-DD » traitées en heure locale (jamais toISOString) : helpers partagés avec ../dates.js.
export const WEEKDAYS_SHORT = WEEKDAY_SHORT;
export const WEEKDAYS_LONG = WEEKDAY_LONG;
export const parseDate = parseDateKey;
export const toDateString = toDateKey;
// 0 = lundi … 6 = dimanche
export const mondayIndex = weekdayIndex;

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Taux 0..1 -> « 73 % » ; null/undefined -> « — ».
export function formatRate(rate) {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)} %`;
}

export const toPercent = (rate) => (rate === null || rate === undefined ? null : Math.round(rate * 1000) / 10);

export const monthShort = (i) => MONTHS_SHORT[i];

export function formatShortDate(str) {
  const d = parseDate(str);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatLongDate(str) {
  const d = parseDate(str);
  return `${WEEKDAYS_LONG[mondayIndex(d)]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}
