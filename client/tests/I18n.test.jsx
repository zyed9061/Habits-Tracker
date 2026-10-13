import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';
import { MESSAGES } from '../src/i18n/messages.js';
import { formatFullDate, formatRate, formatShortDate } from '../src/dashboard/format.js';
import { validateHabit } from '../src/components/HabitForm.jsx';
import { habit, mockFetch } from './fetchMock.js';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
  localStorage.clear();
  document.documentElement.removeAttribute('lang');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const STATS = {
  'GET /api/stats/summary': () => ({
    activeHabits: 1, todayRate: 1, todayCompleted: 1, todayScheduled: 1,
    bestStreak: { value: 3, habitId: 1, habitName: 'Lire' }, rate30d: 0.5,
  }),
  'GET /api/stats/heatmap': () => ({ year: 2026, days: [] }),
  'GET /api/stats/daily': () => [],
  'GET /api/stats/weekday': () => [],
  'GET /api/stats/ranking': () => [],
};

const renderAt = (path) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('language switch (FR / EN)', () => {
  it('defaults to French and sets <html lang="fr">', async () => {
    mockFetch({ 'GET /api/habits': () => [habit()], 'GET /api/checkins': () => [] });
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Mes habitudes' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Langue' })).toHaveValue('fr');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('switches the whole UI to English, persists the choice and updates <html lang>', async () => {
    mockFetch({ 'GET /api/habits': () => [habit()], 'GET /api/checkins': () => [], ...STATS });
    renderAt('/');
    await screen.findByRole('heading', { level: 1, name: 'Mes habitudes' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Langue' }), 'en');

    expect(screen.getByRole('heading', { level: 1, name: 'My habits' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Lire' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lire, Thursday 10\/8 \(today\)/ })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');

    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    await userEvent.click(within(nav).getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Active habits')).toBeInTheDocument();
    expect(screen.getByText('3 d')).toBeInTheDocument();
  });

  it('restores the stored language on load', async () => {
    localStorage.setItem('lang', 'en');
    mockFetch({ 'GET /api/habits': () => [], 'GET /api/checkins': () => [] });
    renderAt('/');
    expect(await screen.findByText('No active habits yet.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
  });

  it('translates client-side API errors (network failure)', async () => {
    localStorage.setItem('lang', 'en');
    mockFetch({
      'GET /api/habits': () => {
        throw new TypeError('Failed to fetch');
      },
      'GET /api/checkins': () => [],
    });
    renderAt('/');
    expect(await screen.findByText('Could not load habits: Server unreachable')).toBeInTheDocument();
  });
});

describe('localized formatters and validation', () => {
  const { fr, en } = MESSAGES;

  it('formats dates and rates per language', () => {
    expect(formatFullDate('2026-10-08', fr)).toBe('jeudi 8 octobre 2026');
    expect(formatFullDate('2026-10-08', en)).toBe('Thursday, October 8, 2026');
    expect(formatShortDate('2026-10-08', fr)).toBe('8 oct.');
    expect(formatShortDate('2026-10-08', en)).toBe('Oct 8');
    expect(formatRate(0.73, fr)).toBe('73 %');
    expect(formatRate(0.73, en)).toBe('73%');
  });

  it('returns validation messages in the requested language', () => {
    const values = { name: ' ', color: '#4F46E5', icon: '📚', type: 'daily', days: [0, 1, 2, 3, 4, 5, 6], weeklyGoal: 7 };
    expect(validateHabit(values, fr).name).toBe('Le nom est obligatoire.');
    expect(validateHabit(values, en).name).toBe('Name is required.');
  });

  it('defines the same keys in every language', () => {
    const shape = (o) =>
      Object.entries(o)
        .flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? shape(v).map((s) => `${k}.${s}`) : [k]))
        .sort();
    expect(shape(en)).toEqual(shape(fr));
  });
});
