// Dates locales au format YYYY-MM-DD (jamais toISOString : décalage UTC).

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

// « jeudi 8/10 » / "Thursday 10/8" selon les textes `t` de la langue courante.
export function formatLongDate(d, t) {
  return t.dayMonth(t.weekdaysLong[weekdayIndex(d)], d.getDate(), d.getMonth());
}
