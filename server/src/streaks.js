// Pure streak computation (F3). No database, no clock: `today` is a parameter.
import { addDays, weekdayOf } from './dates.js';

/** Most recent scheduled day strictly before `date`. `days` must be non-empty. */
export function previousScheduledDay(date, days) {
  let d = addDays(date, -1);
  while (!days.includes(weekdayOf(d))) d = addDays(d, -1);
  return d;
}

/**
 * Computes `{ currentStreak, bestStreak }` for one habit.
 *
 * Rules (API_CONTRACT.md §3):
 * - only scheduled days (weekday ∈ frequency.days) count; other days neither
 *   break nor extend a streak, and check-ins on them are ignored;
 * - currentStreak walks back from today; if today is scheduled but not yet
 *   checked, it starts from the previous scheduled day;
 * - bestStreak is the longest run of consecutive scheduled checked days;
 * - check-ins after `today` are ignored; check-ins before createdAt count.
 *
 * @param {{ days: number[] }} frequency
 * @param {string[]} checkedDates `YYYY-MM-DD`, any order, duplicates allowed
 * @param {string} today `YYYY-MM-DD`
 */
export function computeStreaks(frequency, checkedDates, today) {
  const days = frequency?.days ?? [];
  if (days.length === 0) return { currentStreak: 0, bestStreak: 0 };

  const checked = new Set(
    checkedDates.filter((d) => d <= today && days.includes(weekdayOf(d))),
  );

  let start = days.includes(weekdayOf(today)) ? today : previousScheduledDay(today, days);
  if (start === today && !checked.has(today)) start = previousScheduledDay(today, days);

  let currentStreak = 0;
  for (let d = start; checked.has(d); d = previousScheduledDay(d, days)) currentStreak++;

  let bestStreak = 0;
  let run = 0;
  let prev = null;
  for (const d of [...checked].sort()) {
    run = prev !== null && previousScheduledDay(d, days) === prev ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
    prev = d;
  }

  return { currentStreak, bestStreak: Math.max(bestStreak, currentStreak) };
}
