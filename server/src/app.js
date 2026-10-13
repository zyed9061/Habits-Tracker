import express from 'express';
import { isValidDate, todayStr } from './dates.js';
import { createRepository } from './repository.js';
import * as stats from './stats.js';
import { computeStreaks } from './streaks.js';
import {
  HttpError,
  badRequest,
  intQuery,
  notFound,
  validateHabitPatch,
  validateNewHabit,
} from './validation.js';

/**
 * Builds the Express app without listening.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {{ today?: () => string }} [options] `today` overrides the local date (tests).
 */
export function createApp(db, { today = todayStr } = {}) {
  const repo = createRepository(db);
  const app = express();
  app.use(express.json());

  const withStreaks = (habit, dates) => ({ ...habit, ...computeStreaks(habit.frequency, dates, today()) });

  function findHabit(rawId) {
    const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
    const habit = Number.isSafeInteger(id) ? repo.getHabit(id) : null;
    if (!habit) throw notFound(`Habitude ${rawId} introuvable`);
    return habit;
  }

  const habitResponse = (habit) => withStreaks(habit, repo.habitCheckinDates(habit.id));

  // --- Habits (F1) -------------------------------------------------------------

  app.get('/api/habits', (req, res) => {
    const includeArchived = req.query.includeArchived === 'true';
    const byHabit = stats.indexCheckins(repo.checkins({ includeArchived }));
    res.json(
      repo.listHabits({ includeArchived }).map((h) => withStreaks(h, [...(byHabit.get(h.id) ?? [])])),
    );
  });

  app.get('/api/habits/:id', (req, res) => {
    res.json(habitResponse(findHabit(req.params.id)));
  });

  app.post('/api/habits', (req, res) => {
    const fields = validateNewHabit(req.body);
    res.status(201).json(habitResponse(repo.createHabit(fields, today())));
  });

  app.patch('/api/habits/:id', (req, res) => {
    const habit = findHabit(req.params.id);
    const fields = validateHabitPatch(req.body, habit);
    res.json(habitResponse(repo.updateHabit(habit.id, fields)));
  });

  app.post('/api/habits/:id/archive', (req, res) => {
    const habit = findHabit(req.params.id);
    res.json(habitResponse(repo.setArchived(habit.id, true)));
  });

  app.post('/api/habits/:id/unarchive', (req, res) => {
    const habit = findHabit(req.params.id);
    res.json(habitResponse(repo.setArchived(habit.id, false)));
  });

  // --- Check-ins (F2) ----------------------------------------------------------

  function requireDate(value, name) {
    if (!isValidDate(value)) throw badRequest(`${name} doit être une date valide au format YYYY-MM-DD`);
    return value;
  }

  app.get('/api/checkins', (req, res) => {
    const from = requireDate(req.query.from, 'from');
    const to = requireDate(req.query.to, 'to');
    if (from > to) throw badRequest('from doit être antérieure ou égale à to');
    res.json(repo.activeCheckinsBetween(from, to));
  });

  function checkinTarget(req) {
    const habit = findHabit(req.params.id);
    const date = requireDate(req.params.date, 'date');
    if (date > today()) throw badRequest('Impossible de cocher une date dans le futur');
    if (habit.archived) throw badRequest('Habitude archivée : check-in impossible');
    return { habit, date };
  }

  function checkinResponse(habit, date, done) {
    const streaks = computeStreaks(habit.frequency, repo.habitCheckinDates(habit.id), today());
    return { habitId: habit.id, date, done, ...streaks };
  }

  app.put('/api/habits/:id/checkins/:date', (req, res) => {
    const { habit, date } = checkinTarget(req);
    repo.addCheckin(habit.id, date);
    res.json(checkinResponse(habit, date, true));
  });

  app.delete('/api/habits/:id/checkins/:date', (req, res) => {
    const { habit, date } = checkinTarget(req);
    repo.removeCheckin(habit.id, date);
    res.json(checkinResponse(habit, date, false));
  });

  // --- Stats (F4, F5) — non-archived habits only -------------------------------

  const active = () => ({ habits: repo.listHabits(), checkins: repo.checkins() });

  app.get('/api/stats/summary', (req, res) => {
    const { habits, checkins } = active();
    res.json(stats.summary(habits, checkins, today()));
  });

  app.get('/api/stats/heatmap', (req, res) => {
    const t = today();
    const year = intQuery(req.query.year, 'year', { min: 1970, max: 9999, fallback: Number(t.slice(0, 4)) });
    const { habits, checkins } = active();
    res.json(stats.heatmap(habits, checkins, year, t));
  });

  app.get('/api/stats/daily', (req, res) => {
    const days = intQuery(req.query.days, 'days', { min: 1, max: 365, fallback: 30 });
    const { habits, checkins } = active();
    res.json(stats.daily(habits, checkins, days, today()));
  });

  app.get('/api/stats/weekday', (req, res) => {
    const weeks = intQuery(req.query.weeks, 'weeks', { min: 1, max: 52, fallback: 12 });
    const { habits, checkins } = active();
    res.json(stats.weekday(habits, checkins, weeks, today()));
  });

  app.get('/api/stats/ranking', (req, res) => {
    const days = intQuery(req.query.days, 'days', { min: 1, max: 365, fallback: 30 });
    const { habits, checkins } = active();
    res.json(stats.ranking(habits, checkins, days, today()));
  });

  // --- Errors ------------------------------------------------------------------

  app.use('/api', (req, res) => {
    res.status(404).json({ error: { message: `Route introuvable : ${req.method} ${req.originalUrl}` } });
  });

  // Express recognises an error handler by its 4 arguments: `next` must stay declared.
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { message: err.message } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { message: 'Corps JSON invalide' } });
    }
    if (err?.status >= 400 && err?.status < 500) {
      return res.status(err.status).json({ error: { message: err.message } });
    }
    console.error(err);
    res.status(500).json({ error: { message: 'Erreur interne du serveur' } });
  });

  return app;
}
