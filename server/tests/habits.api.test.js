import { beforeEach, describe, expect, it } from 'vitest';
import { DAILY, TODAY, createHabit, expectError, habitBody, makeApp } from './helpers.js';

let ctx;
beforeEach(() => {
  ctx = makeApp();
});

describe('POST /api/habits (F1)', () => {
  it('creates a habit with the full contract shape', async () => {
    const res = await ctx.api.post('/api/habits').send(habitBody({ name: '  Lire 20 minutes  ' }));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      name: 'Lire 20 minutes',
      color: '#4F46E5',
      icon: '📚',
      frequency: { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6] },
      weeklyGoal: 7,
      archived: false,
      createdAt: TODAY,
      currentStreak: 0,
      bestStreak: 0,
    });
    expect(Number.isInteger(res.body.id)).toBe(true);
  });

  it('defaults weeklyGoal to the number of scheduled days', async () => {
    const h = await createHabit(ctx.api, { frequency: { type: 'weekdays', days: [0, 2, 4] } });
    expect(h.weeklyGoal).toBe(3);
  });

  it('sorts weekdays and replaces daily days with 0..6', async () => {
    const w = await createHabit(ctx.api, { frequency: { type: 'weekdays', days: [4, 0, 2] } });
    expect(w.frequency).toEqual({ type: 'weekdays', days: [0, 2, 4] });
    const d = await createHabit(ctx.api, { frequency: { type: 'daily', days: [1] } });
    expect(d.frequency).toEqual(DAILY);
  });

  it('accepts an explicit weeklyGoal <= scheduled days', async () => {
    const h = await createHabit(ctx.api, { frequency: { type: 'weekdays', days: [0, 2, 4] }, weeklyGoal: 2 });
    expect(h.weeklyGoal).toBe(2);
  });

  it('accepts a 60-char name and a multi-codepoint emoji', async () => {
    const h = await createHabit(ctx.api, { name: 'x'.repeat(60), icon: '🇪🇸' });
    expect(h.name).toHaveLength(60);
    expect(h.icon).toBe('🇪🇸');
  });

  const invalid = [
    ['missing name', { name: undefined }],
    ['empty name after trim', { name: '   ' }],
    ['name > 60 chars', { name: 'x'.repeat(61) }],
    ['non-string name', { name: 42 }],
    ['missing color', { color: undefined }],
    ['color without #', { color: '4F46E5' }],
    ['short color', { color: '#FFF' }],
    ['non-hex color', { color: '#GGGGGG' }],
    ['missing icon', { icon: undefined }],
    ['empty icon', { icon: '' }],
    ['icon > 8 chars', { icon: '123456789' }],
    ['missing frequency', { frequency: undefined }],
    ['unknown frequency type', { frequency: { type: 'monthly', days: [0] } }],
    ['weekdays without days', { frequency: { type: 'weekdays' } }],
    ['weekdays with empty days', { frequency: { type: 'weekdays', days: [] } }],
    ['day out of range', { frequency: { type: 'weekdays', days: [0, 7] } }],
    ['negative day', { frequency: { type: 'weekdays', days: [-1] } }],
    ['non-integer day', { frequency: { type: 'weekdays', days: [1.5] } }],
    ['duplicate days', { frequency: { type: 'weekdays', days: [1, 1] } }],
    ['weeklyGoal 0', { weeklyGoal: 0 }],
    ['weeklyGoal 8', { weeklyGoal: 8 }],
    ['non-integer weeklyGoal', { weeklyGoal: 2.5 }],
    ['weeklyGoal > scheduled days', { frequency: { type: 'weekdays', days: [0, 2] }, weeklyGoal: 3 }],
  ];
  it.each(invalid)('400 on %s', async (_label, overrides) => {
    const res = await ctx.api.post('/api/habits').send(habitBody(overrides));
    expectError(res, 400);
  });

  it('400 on malformed JSON', async () => {
    const res = await ctx.api.post('/api/habits').set('Content-Type', 'application/json').send('{"name":');
    expectError(res, 400);
  });

  it('400 on a non-object body', async () => {
    const res = await ctx.api.post('/api/habits').send([habitBody()]);
    expectError(res, 400);
  });
});

describe('GET /api/habits', () => {
  it('lists non-archived habits by id, includeArchived=true adds archived ones', async () => {
    const a = await createHabit(ctx.api, { name: 'A' });
    const b = await createHabit(ctx.api, { name: 'B' });
    const c = await createHabit(ctx.api, { name: 'C' });
    await ctx.api.post(`/api/habits/${b.id}/archive`).expect(200);

    const res = await ctx.api.get('/api/habits');
    expect(res.status).toBe(200);
    expect(res.body.map((h) => h.id)).toEqual([a.id, c.id]);
    for (const h of res.body) {
      expect(h).toHaveProperty('currentStreak');
      expect(h).toHaveProperty('bestStreak');
    }

    const all = await ctx.api.get('/api/habits?includeArchived=true');
    expect(all.body.map((h) => h.id)).toEqual([a.id, b.id, c.id]);
    expect(all.body[1].archived).toBe(true);
  });

  it('returns [] when there is no habit', async () => {
    const res = await ctx.api.get('/api/habits');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('includes streaks computed from check-ins', async () => {
    const h = await createHabit(ctx.api);
    await ctx.api.put(`/api/habits/${h.id}/checkins/2026-10-07`).expect(200);
    await ctx.api.put(`/api/habits/${h.id}/checkins/2026-10-08`).expect(200);
    const [listed] = (await ctx.api.get('/api/habits')).body;
    expect(listed).toMatchObject({ currentStreak: 2, bestStreak: 2 });
  });
});

describe('GET /api/habits/:id', () => {
  it('returns the habit, archived or not', async () => {
    const h = await createHabit(ctx.api);
    await ctx.api.post(`/api/habits/${h.id}/archive`);
    const res = await ctx.api.get(`/api/habits/${h.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: h.id, archived: true });
  });

  it('404 on unknown or non-numeric id', async () => {
    expectError(await ctx.api.get('/api/habits/999'), 404);
    expectError(await ctx.api.get('/api/habits/abc'), 404);
  });
});

describe('PATCH /api/habits/:id', () => {
  it('updates a subset of fields and keeps the others', async () => {
    const h = await createHabit(ctx.api);
    const res = await ctx.api.patch(`/api/habits/${h.id}`).send({ name: ' Lire 30 min ', color: '#000000' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: h.id, name: 'Lire 30 min', color: '#000000', icon: '📚', frequency: DAILY, weeklyGoal: 7, createdAt: TODAY });
  });

  it('caps weeklyGoal when frequency shrinks without weeklyGoal', async () => {
    const h = await createHabit(ctx.api, { weeklyGoal: 5 });
    const res = await ctx.api.patch(`/api/habits/${h.id}`).send({ frequency: { type: 'weekdays', days: [1, 3] } });
    expect(res.status).toBe(200);
    expect(res.body.weeklyGoal).toBe(2);
    expect(res.body.frequency).toEqual({ type: 'weekdays', days: [1, 3] });
  });

  it('keeps weeklyGoal when frequency grows', async () => {
    const h = await createHabit(ctx.api, { frequency: { type: 'weekdays', days: [1, 3] } });
    const res = await ctx.api.patch(`/api/habits/${h.id}`).send({ frequency: DAILY });
    expect(res.body.weeklyGoal).toBe(2);
  });

  it('400 on invalid fields, nothing changed', async () => {
    const h = await createHabit(ctx.api);
    expectError(await ctx.api.patch(`/api/habits/${h.id}`).send({ name: '' }), 400);
    expectError(await ctx.api.patch(`/api/habits/${h.id}`).send({ color: 'red' }), 400);
    expectError(await ctx.api.patch(`/api/habits/${h.id}`).send({ weeklyGoal: 9 }), 400);
    expectError(await ctx.api.patch(`/api/habits/${h.id}`).send({ frequency: { type: 'weekdays', days: [2] }, weeklyGoal: 3 }), 400);
    const after = (await ctx.api.get(`/api/habits/${h.id}`)).body;
    expect(after).toEqual(h);
  });

  it('404 on unknown habit', async () => {
    expectError(await ctx.api.patch('/api/habits/999').send({ name: 'x' }), 404);
  });

  it('allows editing an archived habit', async () => {
    const h = await createHabit(ctx.api);
    await ctx.api.post(`/api/habits/${h.id}/archive`);
    const res = await ctx.api.patch(`/api/habits/${h.id}`).send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Renamed', archived: true });
  });
});

describe('archive / unarchive', () => {
  it('toggles archived and returns the habit', async () => {
    const h = await createHabit(ctx.api);
    const a = await ctx.api.post(`/api/habits/${h.id}/archive`);
    expect(a.status).toBe(200);
    expect(a.body).toMatchObject({ id: h.id, archived: true });
    const u = await ctx.api.post(`/api/habits/${h.id}/unarchive`);
    expect(u.status).toBe(200);
    expect(u.body).toMatchObject({ id: h.id, archived: false });
  });

  it('404 on unknown habit', async () => {
    expectError(await ctx.api.post('/api/habits/999/archive'), 404);
    expectError(await ctx.api.post('/api/habits/999/unarchive'), 404);
  });
});

describe('unknown routes', () => {
  it('404 with the error shape', async () => {
    expectError(await ctx.api.get('/api/nope'), 404);
  });
});
