import { test as base, expect } from '@playwright/test';

export const API = 'http://127.0.0.1:3001/api';
export const PREFIX = 'QA-e2e';

// Local YYYY-MM-DD (same convention as the app, never toISOString).
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function daysAgo(n) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - n);
}
export const todayKey = () => dateKey(daysAgo(0));
// 0 = Monday … 6 = Sunday
export const weekdayIndex = (d) => (d.getDay() + 6) % 7;

// Independent oracle for the grid cell labels (Intl, not the app's message table).
export function cellLabel(name, d, lang, { today = false, scheduled = true } = {}) {
  if (lang === 'en') {
    const wd = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(d);
    return `${name}, ${wd} ${d.getMonth() + 1}/${d.getDate()}${today ? ' (today)' : ''}${scheduled ? '' : ', not scheduled'}`;
  }
  const wd = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(d);
  return `${name}, ${wd} ${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}${today ? " (aujourd'hui)" : ''}${
    scheduled ? '' : ', non prévu'
  }`;
}

export function uniqueName(label = '') {
  return `${PREFIX} ${label} ${Date.now().toString(36)}`.replace(/\s+/g, ' ').trim();
}

// Opens the app with a given language stored, the way a returning user would.
export async function openWithLang(page, lang, path = '/') {
  await page.addInitScript((l) => {
    if (!sessionStorage.getItem('qa-lang-set')) {
      localStorage.setItem('lang', l);
      sessionStorage.setItem('qa-lang-set', '1');
    }
  }, lang);
  await page.goto(path);
}

async function archiveAllQaHabits(request) {
  const res = await request.get(`${API}/habits`);
  const list = await res.json();
  for (const h of list) {
    if (h.name.startsWith(PREFIX)) await request.post(`${API}/habits/${h.id}/archive`);
  }
}

export const test = base.extend({
  // API helper: create test habits directly, everything prefixed QA-e2e is archived after each test.
  qa: async ({ request }, use) => {
    const qa = {
      async create(fields = {}) {
        const res = await request.post(`${API}/habits`, {
          data: {
            name: uniqueName(fields.label ?? 'habit'),
            color: '#10B981',
            icon: '🧪',
            frequency: { type: 'daily' },
            ...fields,
            label: undefined,
          },
        });
        expect(res.status(), await res.text()).toBe(201);
        return res.json();
      },
      async checkIn(id, date) {
        const res = await request.put(`${API}/habits/${id}/checkins/${date}`);
        expect(res.ok()).toBeTruthy();
        return res.json();
      },
      async get(id) {
        return (await request.get(`${API}/habits/${id}`)).json();
      },
      async summary() {
        return (await request.get(`${API}/stats/summary`)).json();
      },
      async json(path) {
        return (await request.get(`${API}${path}`)).json();
      },
    };
    await archiveAllQaHabits(request);
    await use(qa);
    await archiveAllQaHabits(request);
  },
});

export { expect };
