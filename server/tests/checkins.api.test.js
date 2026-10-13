import { beforeEach, describe, expect, it } from 'vitest';
import { createHabit, expectError, makeApp } from './helpers.js';

let ctx;
let habit;
beforeEach(async () => {
  ctx = makeApp(); // today = Thu 2026-10-08
  habit = await createHabit(ctx.api);
});

const put = (id, date) => ctx.api.put(`/api/habits/${id}/checkins/${date}`);
const del = (id, date) => ctx.api.delete(`/api/habits/${id}/checkins/${date}`);

describe('PUT /api/habits/:id/checkins/:date (F2)', () => {
  it('checks a day and returns streaks', async () => {
    await put(habit.id, '2026-10-07').expect(200);
    const res = await put(habit.id, '2026-10-08');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ habitId: habit.id, date: '2026-10-08', done: true, currentStreak: 2, bestStreak: 2 });
  });

  it('is idempotent', async () => {
    const r1 = await put(habit.id, '2026-10-08');
    const r2 = await put(habit.id, '2026-10-08');
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
    const list = await ctx.api.get('/api/checkins?from=2026-10-08&to=2026-10-08');
    expect(list.body).toEqual([{ habitId: habit.id, date: '2026-10-08' }]);
  });

  it('accepts a past date before createdAt (counts for streaks)', async () => {
    await put(habit.id, '2026-10-06').expect(200);
    await put(habit.id, '2026-10-07').expect(200);
    const res = await put(habit.id, '2026-10-08');
    expect(res.body.currentStreak).toBe(3);
  });

  it('accepts a check-in on a non-scheduled day without counting it', async () => {
    const mwf = await createHabit(ctx.api, { frequency: { type: 'weekdays', days: [0, 2, 4] } });
    await put(mwf.id, '2026-10-05').expect(200); // Mon
    await put(mwf.id, '2026-10-07').expect(200); // Wed
    const res = await put(mwf.id, '2026-10-06'); // Tue, not scheduled
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ done: true, currentStreak: 2, bestStreak: 2 });
    const list = await ctx.api.get('/api/checkins?from=2026-10-06&to=2026-10-06');
    expect(list.body).toEqual([{ habitId: mwf.id, date: '2026-10-06' }]);
  });

  it('400 on a future date', async () => {
    expectError(await put(habit.id, '2026-10-09'), 400);
    expectError(await put(habit.id, '2027-01-01'), 400);
  });

  it.each(['2026-02-30', '2026-13-01', '26-10-08', '2026-10-8', 'today', '2026-10-08T00:00'])(
    '400 on invalid date %s',
    async (date) => {
      expectError(await put(habit.id, date), 400);
    },
  );

  it('404 on unknown habit, checked before the date', async () => {
    expectError(await put(999, '2026-10-08'), 404);
    expectError(await put(999, '2099-01-01'), 404);
    expectError(await put('abc', '2026-10-08'), 404);
  });

  it('400 on an archived habit (after date validation)', async () => {
    await ctx.api.post(`/api/habits/${habit.id}/archive`).expect(200);
    expectError(await put(habit.id, '2026-10-08'), 400);
    expectError(await del(habit.id, '2026-10-08'), 400);
  });
});

describe('DELETE /api/habits/:id/checkins/:date', () => {
  it('unchecks a day and returns updated streaks', async () => {
    await put(habit.id, '2026-10-07');
    await put(habit.id, '2026-10-08');
    const res = await del(habit.id, '2026-10-07');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ habitId: habit.id, date: '2026-10-07', done: false, currentStreak: 1, bestStreak: 1 });
  });

  it('recomputes streaks on uncheck (Mon/Wed/Fri: Fri+Mon+Wed → 3; uncheck Wed → current 0, best 2)', async () => {
    const mwf = await createHabit(ctx.api, { frequency: { type: 'weekdays', days: [0, 2, 4] } });
    await put(mwf.id, '2026-10-02');
    await put(mwf.id, '2026-10-05');
    const r = await put(mwf.id, '2026-10-07');
    expect(r.body).toMatchObject({ currentStreak: 3, bestStreak: 3 });
    const d = await del(mwf.id, '2026-10-07');
    expect(d.body).toEqual({ habitId: mwf.id, date: '2026-10-07', done: false, currentStreak: 0, bestStreak: 2 });
  });

  it('is idempotent (deleting a missing check-in is 200)', async () => {
    const r1 = await del(habit.id, '2026-10-08');
    const r2 = await del(habit.id, '2026-10-08');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual({ habitId: habit.id, date: '2026-10-08', done: false, currentStreak: 0, bestStreak: 0 });
  });

  it('400 on future/invalid date, 404 on unknown habit', async () => {
    expectError(await del(habit.id, '2026-10-09'), 400);
    expectError(await del(habit.id, 'nope'), 400);
    expectError(await del(999, '2026-10-08'), 404);
  });
});

describe('GET /api/checkins', () => {
  it('returns check-ins within inclusive bounds, non-archived habits only', async () => {
    const other = await createHabit(ctx.api, { name: 'Autre' });
    await put(habit.id, '2026-10-05');
    await put(habit.id, '2026-10-06');
    await put(habit.id, '2026-10-08');
    await put(other.id, '2026-10-06');
    await put(other.id, '2026-10-07');
    await ctx.api.post(`/api/habits/${other.id}/archive`);

    const res = await ctx.api.get('/api/checkins?from=2026-10-06&to=2026-10-08');
    expect(res.status).toBe(200);
    const sorted = [...res.body].sort((a, b) => a.date.localeCompare(b.date) || a.habitId - b.habitId);
    expect(sorted).toEqual([
      { habitId: habit.id, date: '2026-10-06' },
      { habitId: habit.id, date: '2026-10-08' },
    ]);
  });

  it('400 when from/to missing, invalid or from > to', async () => {
    expectError(await ctx.api.get('/api/checkins'), 400);
    expectError(await ctx.api.get('/api/checkins?from=2026-10-01'), 400);
    expectError(await ctx.api.get('/api/checkins?to=2026-10-01'), 400);
    expectError(await ctx.api.get('/api/checkins?from=2026-10-01&to=bad'), 400);
    expectError(await ctx.api.get('/api/checkins?from=2026-10-08&to=2026-10-01'), 400);
  });

  it('from == to is allowed', async () => {
    const res = await ctx.api.get('/api/checkins?from=2026-10-08&to=2026-10-08');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
