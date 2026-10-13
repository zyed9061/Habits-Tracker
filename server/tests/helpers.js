import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { createApp } from '../src/app.js';

// 2026-10-08 is a Thursday (weekday 3 with 0 = Monday).
export const TODAY = '2026-10-08';

/** App on an in-memory database with a controllable clock (`options` go to createApp, e.g. `openai`). */
export function makeApp(today = TODAY, options = {}) {
  const clock = { today };
  const db = new DatabaseSync(':memory:');
  const app = createApp(db, { ...options, today: () => clock.today });
  return { app, db, clock, api: request(app) };
}

export const DAILY = { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6] };

export function habitBody(overrides = {}) {
  return { name: 'Lire', color: '#4F46E5', icon: '📚', frequency: DAILY, ...overrides };
}

export async function createHabit(api, overrides = {}) {
  const res = await api.post('/api/habits').send(habitBody(overrides));
  if (res.status !== 201) throw new Error(`createHabit failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function check(api, id, dates) {
  for (const d of dates) {
    const res = await api.put(`/api/habits/${id}/checkins/${d}`);
    if (res.status !== 200) throw new Error(`check ${id} ${d} failed: ${res.status}`);
  }
}

/** Asserts the contract error shape `{ error: { message } }`. */
export function expectError(res, status) {
  if (res.status !== status) {
    throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  if (typeof res.body?.error?.message !== 'string' || res.body.error.message === '') {
    throw new Error(`bad error shape: ${JSON.stringify(res.body)}`);
  }
}
