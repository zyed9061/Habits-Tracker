// Pure statistics (F4, F5). No database, no clock: callers pass the active
// (non-archived) habits, their check-ins and `today`.
//
// habit:   { id, name, color, icon, frequency: { days }, createdAt }
// checkin: { habitId, date }
//
// A day counts for a habit when it is scheduled AND >= createdAt. Only check-ins
// on counted days are "completed"; rate = completed / scheduled, or null when
// nothing was scheduled.
import { addDays, dateRange, weekdayOf } from './dates.js';
import { computeStreaks } from './streaks.js';

export const rate = (completed, scheduled) => (scheduled === 0 ? null : completed / scheduled);

export function isCounted(habit, date) {
  return date >= habit.createdAt && habit.frequency.days.includes(weekdayOf(date));
}

/** Map habitId -> Set of checked dates. */
export function indexCheckins(checkins) {
  const byHabit = new Map();
  for (const { habitId, date } of checkins) {
    if (!byHabit.has(habitId)) byHabit.set(habitId, new Set());
    byHabit.get(habitId).add(date);
  }
  return byHabit;
}

function countDay(habits, byHabit, date) {
  let completed = 0;
  let scheduled = 0;
  for (const h of habits) {
    if (!isCounted(h, date)) continue;
    scheduled++;
    if (byHabit.get(h.id)?.has(date)) completed++;
  }
  return { completed, scheduled };
}

/** Totals of countDay over a list of dates. */
function countDays(habits, byHabit, dates) {
  let completed = 0;
  let scheduled = 0;
  for (const date of dates) {
    const day = countDay(habits, byHabit, date);
    completed += day.completed;
    scheduled += day.scheduled;
  }
  return { completed, scheduled };
}

/** Per-day aggregates over an inclusive date range. */
function dayRows(habits, byHabit, from, to) {
  return dateRange(from, to).map((date) => {
    const { completed, scheduled } = countDay(habits, byHabit, date);
    return { date, completed, scheduled, rate: rate(completed, scheduled) };
  });
}

function streaksFor(habit, byHabit, today) {
  return computeStreaks(habit.frequency, [...(byHabit.get(habit.id) ?? [])], today);
}

export function summary(habits, checkins, today) {
  const byHabit = indexCheckins(checkins);
  const t = countDay(habits, byHabit, today);

  let best = null;
  for (const h of habits) {
    const { bestStreak } = streaksFor(h, byHabit, today);
    if (best === null || bestStreak > best.value) {
      best = { value: bestStreak, habitId: h.id, habitName: h.name };
    }
  }

  const last30 = dayRows(habits, byHabit, addDays(today, -29), today);
  const completed30 = last30.reduce((s, d) => s + d.completed, 0);
  const scheduled30 = last30.reduce((s, d) => s + d.scheduled, 0);

  return {
    activeHabits: habits.length,
    todayRate: rate(t.completed, t.scheduled),
    todayCompleted: t.completed,
    todayScheduled: t.scheduled,
    bestStreak: best,
    rate30d: rate(completed30, scheduled30),
  };
}

/** One entry per day of `year` up to today inclusive (empty for a future year). */
export function heatmap(habits, checkins, year, today) {
  const from = `${String(year).padStart(4, '0')}-01-01`;
  const yearEnd = `${String(year).padStart(4, '0')}-12-31`;
  const to = yearEnd < today ? yearEnd : today;
  return { year, days: dayRows(habits, indexCheckins(checkins), from, to) };
}

/** The last `days` days, today included, chronological. */
export function daily(habits, checkins, days, today) {
  return dayRows(habits, indexCheckins(checkins), addDays(today, -(days - 1)), today);
}

/** 7 rows (Monday→Sunday) over the last `weeks * 7` days, today included. */
export function weekday(habits, checkins, weeks, today) {
  const rows = Array.from({ length: 7 }, (_, i) => ({ weekday: i, completed: 0, scheduled: 0 }));
  for (const d of dayRows(habits, indexCheckins(checkins), addDays(today, -(weeks * 7 - 1)), today)) {
    const row = rows[weekdayOf(d.date)];
    row.completed += d.completed;
    row.scheduled += d.scheduled;
  }
  return rows.map((r) => ({ ...r, rate: rate(r.completed, r.scheduled) }));
}

/** Per-habit completion over the last `days` days, sorted by rate desc (null last, then id). */
export function ranking(habits, checkins, days, today) {
  const byHabit = indexCheckins(checkins);
  const range = dateRange(addDays(today, -(days - 1)), today);
  const rows = habits.map((h) => {
    const { completed, scheduled } = countDays([h], byHabit, range);
    return {
      habitId: h.id,
      name: h.name,
      color: h.color,
      icon: h.icon,
      completed,
      scheduled,
      rate: rate(completed, scheduled),
      currentStreak: streaksFor(h, byHabit, today).currentStreak,
    };
  });
  return rows.sort((a, b) => {
    if (a.rate === null || b.rate === null) {
      if (a.rate === b.rate) return a.habitId - b.habitId;
      return a.rate === null ? 1 : -1;
    }
    return b.rate - a.rate || a.habitId - b.habitId;
  });
}
