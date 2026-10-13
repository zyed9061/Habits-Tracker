import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { TODAY } from './helpers.js';

describe('seed (§5)', () => {
  it('creates 5 varied habits with ~120 days of history and readable stats', async () => {
    const db = new DatabaseSync(':memory:');
    const result = seed(db, TODAY);
    expect(result.habits).toBe(5);
    const api = request(createApp(db, { today: () => TODAY }));

    const all = (await api.get('/api/habits?includeArchived=true')).body;
    expect(all).toHaveLength(5);
    expect(all.some((h) => h.frequency.type === 'weekdays')).toBe(true);
    expect(all.filter((h) => h.archived)).toHaveLength(1);
    const oldest = all.map((h) => h.createdAt).sort()[0];
    expect(oldest <= '2026-06-15').toBe(true); // ~120 days before 10-08

    const daily = (await api.get('/api/stats/daily?days=90')).body;
    expect(daily.filter((d) => d.completed > 0).length).toBeGreaterThan(60);

    // no check-in in the future
    const future = (await api.get('/api/checkins?from=2026-10-09&to=2027-12-31')).body;
    expect(future).toEqual([]);
  });

  it('is reproducible and re-runnable', () => {
    const db = new DatabaseSync(':memory:');
    const r1 = seed(db, TODAY);
    const r2 = seed(db, TODAY);
    expect(r2).toEqual(r1);
  });
});
