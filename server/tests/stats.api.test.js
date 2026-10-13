import { beforeAll, describe, expect, it } from 'vitest';
import { check, createHabit, expectError, makeApp } from './helpers.js';

// Hand-computed scenario, today = Thu 2026-10-08 (0 = Monday … 6 = Sunday).
//
// A (id 1) daily,            created Thu 10-01. Checked 09-29, 09-30 (before createdAt: streaks only),
//                            10-01, 10-02, 10-03, 10-05, 10-06, 10-07, 10-08 — 10-04 (Sun) missed.
//                            currentStreak 4 (10-05..10-08), bestStreak 5 (09-29..10-03).
// B (id 2) Mon/Wed/Fri,      created Thu 10-01. Scheduled & counted: Fri 10-02, Mon 10-05, Wed 10-07.
//                            Checked 10-02, 10-07 + Tue 10-06 (not scheduled). current 1, best 1.
// C (id 3) daily,            created 10-08, nothing checked. current 0, best 0.
// D (id 4) daily,            created 10-08, checked 10-08, then ARCHIVED: excluded everywhere.
// E (id 5) Saturday only,    created 10-08: nothing counted yet (rate null).
let api;
const ids = {};

beforeAll(async () => {
  const ctx = makeApp('2026-10-01');
  api = ctx.api;
  ids.A = (await createHabit(api, { name: 'A', color: '#111111', icon: '📚' })).id;
  ids.B = (await createHabit(api, { name: 'B', color: '#222222', icon: '🏃', frequency: { type: 'weekdays', days: [0, 2, 4] } })).id;
  ctx.clock.today = '2026-10-08';
  ids.C = (await createHabit(api, { name: 'C', color: '#333333', icon: '🧘' })).id;
  ids.D = (await createHabit(api, { name: 'D', color: '#444444', icon: '💧' })).id;
  ids.E = (await createHabit(api, { name: 'E', color: '#555555', icon: '🧹', frequency: { type: 'weekdays', days: [5] } })).id;

  await check(api, ids.A, ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03',
    '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
  await check(api, ids.B, ['2026-10-02', '2026-10-06', '2026-10-07']);
  await check(api, ids.D, ['2026-10-08']);
  await api.post(`/api/habits/${ids.D}/archive`).expect(200);
});

describe('habit streaks in the scenario', () => {
  it('matches the hand-computed values', async () => {
    const res = await api.get('/api/habits');
    const byId = Object.fromEntries(res.body.map((h) => [h.id, h]));
    expect(Object.keys(byId).map(Number)).toEqual([ids.A, ids.B, ids.C, ids.E]);
    expect(byId[ids.A]).toMatchObject({ currentStreak: 4, bestStreak: 5 });
    expect(byId[ids.B]).toMatchObject({ currentStreak: 1, bestStreak: 1 });
    expect(byId[ids.C]).toMatchObject({ currentStreak: 0, bestStreak: 0 });
  });
});

describe('GET /api/stats/summary', () => {
  it('returns hand-computed values', async () => {
    const res = await api.get('/api/stats/summary');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      activeHabits: 4,
      // today: A checked, C scheduled not checked; B and E not scheduled; D archived
      todayRate: 0.5,
      todayCompleted: 1,
      todayScheduled: 2,
      bestStreak: { value: 5, habitId: ids.A, habitName: 'A' },
      // last 30 days: A 7/8, B 2/3, C 0/1 → 9/12
      rate30d: 0.75,
    });
  });

  it('empty database: no active habit → bestStreak null, rates null', async () => {
    const { api: empty } = makeApp();
    const res = await empty.get('/api/stats/summary');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      activeHabits: 0, todayRate: null, todayCompleted: 0, todayScheduled: 0, bestStreak: null, rate30d: null,
    });
  });

  it('bestStreak is 0 (not null) when habits exist without check-ins, tie → smallest id', async () => {
    const { api: fresh } = makeApp();
    const h1 = await createHabit(fresh, { name: 'Premier' });
    await createHabit(fresh, { name: 'Second' });
    const res = await fresh.get('/api/stats/summary');
    expect(res.body.bestStreak).toEqual({ value: 0, habitId: h1.id, habitName: 'Premier' });
  });
});

describe('GET /api/stats/daily', () => {
  it('returns the last N days in chronological order with hand-computed values', async () => {
    const res = await api.get('/api/stats/daily?days=3');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { date: '2026-10-06', completed: 1, scheduled: 1, rate: 1 }, // A only (B Tue not scheduled)
      { date: '2026-10-07', completed: 2, scheduled: 2, rate: 1 }, // A + B
      { date: '2026-10-08', completed: 1, scheduled: 2, rate: 0.5 }, // A, C
    ]);
  });

  it('defaults to 30 days ending today', async () => {
    const res = await api.get('/api/stats/daily');
    expect(res.body).toHaveLength(30);
    expect(res.body[0].date).toBe('2026-09-09');
    expect(res.body[29].date).toBe('2026-10-08');
    // before any habit existed: nothing scheduled → rate null
    expect(res.body[0]).toEqual({ date: '2026-09-09', completed: 0, scheduled: 0, rate: null });
    // 10-04 (Sun): A scheduled but missed
    expect(res.body.find((d) => d.date === '2026-10-04')).toEqual({ date: '2026-10-04', completed: 0, scheduled: 1, rate: 0 });
  });

  it('check-ins before createdAt are not counted in rates', async () => {
    const res = await api.get('/api/stats/daily?days=10');
    expect(res.body.find((d) => d.date === '2026-09-30')).toEqual({ date: '2026-09-30', completed: 0, scheduled: 0, rate: null });
  });

  it('days=1 and days=365 are accepted', async () => {
    expect((await api.get('/api/stats/daily?days=1')).body).toHaveLength(1);
    expect((await api.get('/api/stats/daily?days=365')).body).toHaveLength(365);
  });

  it.each(['0', '366', 'abc', '-1', '2.5'])('400 on days=%s', async (v) => {
    expectError(await api.get(`/api/stats/daily?days=${v}`), 400);
  });
});

describe('GET /api/stats/weekday', () => {
  it('returns 7 rows Monday→Sunday for weeks=1 (10-02..10-08)', async () => {
    const res = await api.get('/api/stats/weekday?weeks=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { weekday: 0, completed: 1, scheduled: 2, rate: 0.5 }, // Mon 10-05: A ok, B missed
      { weekday: 1, completed: 1, scheduled: 1, rate: 1 }, // Tue 10-06: A
      { weekday: 2, completed: 2, scheduled: 2, rate: 1 }, // Wed 10-07: A, B
      { weekday: 3, completed: 1, scheduled: 2, rate: 0.5 }, // Thu 10-08: A ok, C not
      { weekday: 4, completed: 2, scheduled: 2, rate: 1 }, // Fri 10-02: A, B
      { weekday: 5, completed: 1, scheduled: 1, rate: 1 }, // Sat 10-03: A (E created later)
      { weekday: 6, completed: 0, scheduled: 1, rate: 0 }, // Sun 10-04: A missed
    ]);
  });

  it('weeks=2 adds Thu 10-01 (A) and nothing else counted', async () => {
    const res = await api.get('/api/stats/weekday?weeks=2');
    expect(res.body[3]).toEqual({ weekday: 3, completed: 2, scheduled: 3, rate: 2 / 3 });
    expect(res.body[0]).toEqual({ weekday: 0, completed: 1, scheduled: 2, rate: 0.5 });
  });

  it('defaults to 12 weeks and returns 7 rows', async () => {
    const res = await api.get('/api/stats/weekday');
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it.each(['0', '53', 'x'])('400 on weeks=%s', async (v) => {
    expectError(await api.get(`/api/stats/weekday?weeks=${v}`), 400);
  });
});

describe('GET /api/stats/ranking', () => {
  it('sorts by rate desc with null last (days=7: 10-02..10-08)', async () => {
    const res = await api.get('/api/stats/ranking?days=7');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { habitId: ids.A, name: 'A', color: '#111111', icon: '📚', completed: 6, scheduled: 7, rate: 6 / 7, currentStreak: 4 },
      { habitId: ids.B, name: 'B', color: '#222222', icon: '🏃', completed: 2, scheduled: 3, rate: 2 / 3, currentStreak: 1 },
      { habitId: ids.C, name: 'C', color: '#333333', icon: '🧘', completed: 0, scheduled: 1, rate: 0, currentStreak: 0 },
      { habitId: ids.E, name: 'E', color: '#555555', icon: '🧹', completed: 0, scheduled: 0, rate: null, currentStreak: 0 },
    ]);
  });

  it('rates are not rounded server-side', async () => {
    const res = await api.get('/api/stats/ranking?days=7');
    expect(res.body[0].rate).toBeCloseTo(0.857142857, 8);
  });

  it.each(['0', '366'])('400 on days=%s', async (v) => {
    expectError(await api.get(`/api/stats/ranking?days=${v}`), 400);
  });

  it('equal rates are ordered by id; default window is 30 days', async () => {
    const { api: a2 } = makeApp();
    const h1 = await createHabit(a2, { name: 'Un' });
    const h2 = await createHabit(a2, { name: 'Deux' });
    const h3 = await createHabit(a2, { name: 'Trois' });
    await check(a2, h3.id, ['2026-10-08']);
    const res = await a2.get('/api/stats/ranking');
    expect(res.body.map((r) => [r.habitId, r.rate])).toEqual([[h3.id, 1], [h1.id, 0], [h2.id, 0]]);
  });
});

describe('GET /api/stats/heatmap', () => {
  it('one entry per day of the year up to today', async () => {
    const res = await api.get('/api/stats/heatmap?year=2026');
    expect(res.status).toBe(200);
    expect(res.body.year).toBe(2026);
    expect(res.body.days).toHaveLength(281); // 01-01 .. 10-08
    expect(res.body.days[0]).toEqual({ date: '2026-01-01', completed: 0, scheduled: 0, rate: null });
    expect(res.body.days.at(-1)).toEqual({ date: '2026-10-08', completed: 1, scheduled: 2, rate: 0.5 });
    expect(res.body.days.find((d) => d.date === '2026-10-07')).toEqual({ date: '2026-10-07', completed: 2, scheduled: 2, rate: 1 });
    // no gaps, chronological
    const dates = res.body.days.map((d) => d.date);
    expect(new Set(dates).size).toBe(281);
    expect([...dates].sort()).toEqual(dates);
  });

  it('defaults to the current year', async () => {
    const res = await api.get('/api/stats/heatmap');
    expect(res.body.year).toBe(2026);
    expect(res.body.days).toHaveLength(281);
  });

  it('a past year is complete, a future year is empty', async () => {
    const past = await api.get('/api/stats/heatmap?year=2024');
    expect(past.body.days).toHaveLength(366); // leap year
    expect(past.body.days.at(-1).date).toBe('2024-12-31');
    const last = await api.get('/api/stats/heatmap?year=2025');
    expect(last.body.days).toHaveLength(365);
    expect(last.body.days[0].date).toBe('2025-01-01');
    expect(last.body.days.at(-1).date).toBe('2025-12-31');
    const future = await api.get('/api/stats/heatmap?year=2027');
    expect(future.status).toBe(200);
    expect(future.body).toEqual({ year: 2027, days: [] });
  });

  it.each(['1969', '10000', 'abc'])('400 on year=%s', async (v) => {
    expectError(await api.get(`/api/stats/heatmap?year=${v}`), 400);
  });
});

describe('archived habits are excluded from stats', () => {
  it('unarchiving D brings its check-in back into today stats', async () => {
    const { api: a2, clock } = makeApp('2026-10-08');
    const h = await createHabit(a2);
    await check(a2, h.id, ['2026-10-08']);
    await a2.post(`/api/habits/${h.id}/archive`);
    expect((await a2.get('/api/stats/summary')).body).toMatchObject({ activeHabits: 0, todayScheduled: 0 });
    expect((await a2.get('/api/stats/ranking')).body).toEqual([]);
    await a2.post(`/api/habits/${h.id}/unarchive`);
    expect((await a2.get('/api/stats/summary')).body).toMatchObject({ activeHabits: 1, todayCompleted: 1, todayScheduled: 1, todayRate: 1 });
    expect(clock.today).toBe('2026-10-08');
  });
});
