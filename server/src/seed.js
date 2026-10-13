// `npm run seed`: recreates the database with 5 habits and ~120 days of history.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { addDays, dateRange, todayStr, weekdayOf } from './dates.js';
import { DEFAULT_DB_PATH, openDb } from './db.js';
import { createRepository } from './repository.js';

const HISTORY_DAYS = 120;

// `base`: probability of completion; `days` default to every day.
const HABITS = [
  { name: 'Lire 20 minutes', color: '#4F46E5', icon: '📚', type: 'daily', weeklyGoal: 7, base: 0.82, ageDays: HISTORY_DAYS },
  { name: 'Sport', color: '#16A34A', icon: '🏃', type: 'weekdays', days: [0, 2, 4], weeklyGoal: 3, base: 0.75, ageDays: HISTORY_DAYS, bonus: 0.15 },
  { name: 'Méditer', color: '#F59E0B', icon: '🧘', type: 'daily', weeklyGoal: 5, base: 0.6, ageDays: 95 },
  { name: "Boire 2 L d'eau", color: '#0EA5E9', icon: '💧', type: 'daily', weeklyGoal: 7, base: 0.88, ageDays: 60 },
  { name: 'Apprendre l’espagnol', color: '#DC2626', icon: '🇪🇸', type: 'weekdays', days: [0, 1, 2, 3, 4], weeklyGoal: 4, base: 0.5, ageDays: HISTORY_DAYS, archived: true, stopAfter: 70 },
];

/** Deterministic PRNG (mulberry32) so the seed is reproducible. */
function prng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seed(db, today = todayStr()) {
  db.exec('DROP TABLE IF EXISTS checkins; DROP TABLE IF EXISTS habits;');
  const repo = createRepository(db); // recreates the schema
  const random = prng(20261008);

  let total = 0;
  db.exec('BEGIN');
  try {
    for (const h of HABITS) {
      const days = h.type === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : h.days;
      const createdAt = addDays(today, -h.ageDays);
      const { id } = repo.createHabit(
        { name: h.name, color: h.color, icon: h.icon, frequency: { type: h.type, days }, weeklyGoal: h.weeklyGoal },
        createdAt,
      );
      if (h.archived) repo.setArchived(id, true);

      // Markov-ish: success makes the next success likelier; weekends are harder
      // for daily habits; a slow upward trend over the period.
      let last = random() < h.base;
      const range = dateRange(createdAt, today);
      range.forEach((date, i) => {
        if (h.stopAfter !== undefined && i > h.stopAfter) return;
        const wd = weekdayOf(date);
        const scheduled = days.includes(wd);
        let p = scheduled ? h.base : (h.bonus ?? 0);
        if (scheduled) {
          p += last ? 0.08 : -0.15;
          if (h.type === 'daily' && wd >= 5) p -= 0.12;
          p += 0.1 * (i / range.length) - 0.05;
        }
        // Today: the day is not over, leave some habits unchecked.
        if (date === today) p = scheduled ? (h.base > 0.8 ? 1 : 0) : 0;
        const done = random() < Math.max(0, Math.min(1, p));
        if (done) {
          repo.addCheckin(id, date);
          total++;
        }
        if (scheduled) last = done;
      });
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { habits: HABITS.length, checkins: total };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = process.env.DB_PATH || DEFAULT_DB_PATH;
  const db = openDb(path);
  const { habits, checkins } = seed(db);
  db.close();
  console.log(`Seed terminé : ${habits} habitudes, ${checkins} check-ins → ${path === ':memory:' ? path : resolve(path)}`);
}
