// Ces helpers lisent la langue courante dans le store i18n : les composants qui les appellent
// doivent aussi s'abonner via useI18n() pour se re-rendre au changement de langue.
// Dates locales au format YYYY-MM-DD (jamais toISOString : décalage UTC).
import { getLang, weekdayLong } from './i18n/index.js';

export function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 0 = lundi … 6 = dimanche
export function weekdayIndex(d) {
  return (d.getDay() + 6) % 7;
}

// Aujourd'hui et les 6 jours précédents, du plus ancien au plus récent.
export function lastSevenDays(today = new Date()) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    days.push({ key: toDateKey(d), date: d, weekday: weekdayIndex(d), isToday: i === 0 });
  }
  return days;
}

// « lundi 08/10 » en français, « Monday 10/08 » en anglais.
export function formatLongDate(d) {
  const day = d.getDate();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const numeric = getLang() === 'en' ? `${month}/${day}` : `${day}/${month}`;
  return `${weekdayLong(weekdayIndex(d))} ${numeric}`;
}
