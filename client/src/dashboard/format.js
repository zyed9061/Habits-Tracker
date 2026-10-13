export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const WEEKDAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Taux 0..1 -> « 73 % » ; null/undefined -> « — ».
export function formatRate(rate) {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)} %`;
}

export const toPercent = (rate) => (rate === null || rate === undefined ? null : Math.round(rate * 1000) / 10);

// Dates « YYYY-MM-DD » traitées en heure locale (jamais toISOString).
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 0 = lundi … 6 = dimanche
export const mondayIndex = (date) => (date.getDay() + 6) % 7;

export const monthShort = (i) => MONTHS_SHORT[i];

export function formatShortDate(str) {
  const d = parseDate(str);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatLongDate(str) {
  const d = parseDate(str);
  return `${WEEKDAYS_LONG[mondayIndex(d)]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export const formatCount = (completed, scheduled) => `${completed}/${scheduled}`;
