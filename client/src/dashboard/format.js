// Ces helpers lisent la langue courante dans le store i18n : les composants qui les appellent
// doivent aussi s'abonner via useI18n() pour se re-rendre au changement de langue.
import { parseDateKey, toDateKey, weekdayIndex } from '../dates.js';
import { getLang, monthLong, monthShort, weekdayLong, weekdayShort } from '../i18n/index.js';

// Dates « YYYY-MM-DD » traitées en heure locale (jamais toISOString) : helpers partagés avec ../dates.js.
export const parseDate = parseDateKey;
export const toDateString = toDateKey;
// 0 = lundi … 6 = dimanche
export const mondayIndex = weekdayIndex;

export { monthShort, weekdayLong, weekdayShort };

// Taux 0..1 -> « 73 % » (fr, espace fine insécable) / « 73% » (en) ; null/undefined -> « — ».
export function formatRate(rate) {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}${getLang() === 'en' ? '' : ' '}%`;
}

export const toPercent = (rate) => (rate === null || rate === undefined ? null : Math.round(rate * 1000) / 10);

// « 8 oct. » (fr) / « Oct 8 » (en)
export function formatShortDate(str) {
  const d = parseDate(str);
  return getLang() === 'en' ? `${monthShort(d.getMonth())} ${d.getDate()}` : `${d.getDate()} ${monthShort(d.getMonth())}`;
}

// « jeudi 8 octobre 2026 » (fr) / « Thursday, October 8, 2026 » (en)
export function formatLongDate(str) {
  const d = parseDate(str);
  const weekday = weekdayLong(mondayIndex(d));
  const month = monthLong(d.getMonth());
  return getLang() === 'en'
    ? `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()}`
    : `${weekday} ${d.getDate()} ${month} ${d.getFullYear()}`;
}
