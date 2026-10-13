import { vi } from 'vitest';

/**
 * Installs a fake global fetch. `routes` maps "METHOD /api/path" (query string
 * ignored unless the key contains "?") to a handler returning
 * `{ status, body }`, a body (status 200), or a Promise of either. A handler
 * may throw to simulate a network failure.
 */
export function mockFetch(routes) {
  const calls = [];
  const fn = vi.fn(async (url, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const full = String(url);
    const path = full.split('?')[0];
    calls.push({ method, url: full, body: init.body ? JSON.parse(init.body) : undefined });
    const handler = routes[`${method} ${full}`] ?? routes[`${method} ${path}`] ?? findPattern(routes, method, path);
    if (!handler) return jsonResponse(404, { error: { message: `no mock for ${method} ${full}` } });
    const out = await handler({ method, url: full, body: init.body ? JSON.parse(init.body) : undefined });
    if (out && typeof out === 'object' && 'status' in out && 'body' in out) return jsonResponse(out.status, out.body);
    return jsonResponse(200, out);
  });
  fn.calls = calls;
  globalThis.fetch = fn;
  return fn;
}

// Keys like "PUT /api/habits/:id/checkins/:date"
function findPattern(routes, method, path) {
  for (const [key, handler] of Object.entries(routes)) {
    const [m, p] = key.split(' ');
    if (m !== method || !p.includes(':')) continue;
    const re = new RegExp(`^${p.split('?')[0].replace(/:[^/]+/g, '[^/]+')}$`);
    if (re.test(path)) return handler;
  }
  return null;
}

export function jsonResponse(status, body) {
  const text = body === undefined ? '' : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
}

/** A promise you resolve from the test, to observe intermediate (optimistic / loading) states. */
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const habit = (overrides = {}) => ({
  id: 1,
  name: 'Lire',
  color: '#4F46E5',
  icon: '📚',
  frequency: { type: 'daily', days: [0, 1, 2, 3, 4, 5, 6] },
  weeklyGoal: 7,
  archived: false,
  createdAt: '2026-09-01',
  currentStreak: 2,
  bestStreak: 5,
  ...overrides,
});
