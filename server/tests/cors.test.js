import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { initSchema } from '../src/db.js';
import { parseOrigins } from '../src/cors.js';

const ORIGIN = 'https://zyed9061.github.io';

function appWith(corsOrigins) {
  const db = new DatabaseSync(':memory:');
  initSchema(db);
  return createApp(db, { corsOrigins });
}

describe('CORS', () => {
  it('parses a comma-separated list and strips trailing slashes', () => {
    expect(parseOrigins(` ${ORIGIN}/ , http://localhost:5173 ,`)).toEqual([ORIGIN, 'http://localhost:5173']);
    expect(parseOrigins('')).toEqual([]);
  });

  it('echoes an allowed origin', async () => {
    const res = await request(appWith([ORIGIN])).get('/api/habits').set('Origin', ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
  });

  it('answers a preflight for an allowed origin', async () => {
    const res = await request(appWith([ORIGIN]))
      .options('/api/habits')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
  });

  it('sends no CORS headers to other origins or when unconfigured', async () => {
    const other = await request(appWith([ORIGIN])).get('/api/habits').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    const none = await request(appWith([])).get('/api/habits').set('Origin', ORIGIN);
    expect(none.headers['access-control-allow-origin']).toBeUndefined();
  });
});
