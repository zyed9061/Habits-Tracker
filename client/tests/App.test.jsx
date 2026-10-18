import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';
import { setLang } from '../src/i18n/index.js';
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
  document.documentElement.removeAttribute('data-theme');
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

describe('<App /> routing and layout', () => {
  it('navigates from the habits page to the lazy-loaded dashboard', async () => {
    mockFetch({ 'GET /api/habits': () => [habit()], 'GET /api/checkins': () => [], ...STATS });
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Mes habitudes' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    await userEvent.click(within(nav).getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Tableau de bord' }, { timeout: 5000 })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveClass('active');
  });

  it('shows a not-found message on an unknown route', () => {
    mockFetch({});
    renderAt('/nope');
    expect(screen.getByText('Page introuvable.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour aux habitudes' })).toHaveAttribute('href', '/');
  });

  it('theme select sets data-theme and persists it, "system" removes it', async () => {
    mockFetch({ 'GET /api/habits': () => [], 'GET /api/checkins': () => [] });
    renderAt('/');
    const select = screen.getByRole('combobox', { name: 'Thème' });
    expect(select).toHaveValue('system');
    await userEvent.selectOptions(select, 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('theme')).toBe('dark');
    await userEvent.selectOptions(select, 'system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('theme')).toBeNull();
  });
});

describe('habits page flows', () => {
  it('edits a habit and shows the confirmation', async () => {
    const f = mockFetch({
      'GET /api/habits': () => [habit()],
      'GET /api/checkins': () => [],
      'PATCH /api/habits/:id': ({ body }) => habit({ ...body }),
    });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier Lire' }));
    const name = screen.getByLabelText('Nom');
    await userEvent.clear(name);
    await userEvent.type(name, 'Lire 30 min');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('« Lire 30 min » modifiée.')).toBeInTheDocument();
    expect(within(screen.getByTestId('habit-1')).getByRole('heading', { level: 2 })).toHaveTextContent('Lire 30 min');
    expect(f.calls.find((c) => c.method === 'PATCH')).toMatchObject({ url: '/api/habits/1', body: { name: 'Lire 30 min' } });
  });

  it('does not archive when the confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const f = mockFetch({ 'GET /api/habits': () => [habit()], 'GET /api/checkins': () => [] });
    renderAt('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Archiver Lire' }));
    expect(f.calls.some((c) => c.url.includes('/archive'))).toBe(false);
    expect(screen.getByTestId('habit-1')).toBeInTheDocument();
  });

  it('lists archived habits and unarchives one, reloading the grid', async () => {
    let restored = false;
    const f = mockFetch({
      'GET /api/habits?includeArchived=true': () => [habit(), habit({ id: 2, name: 'Sport', archived: true })],
      'GET /api/habits': () => (restored ? [habit(), habit({ id: 2, name: 'Sport' })] : [habit()]),
      'GET /api/checkins': () => [],
      'POST /api/habits/:id/unarchive': () => {
        restored = true;
        return habit({ id: 2, name: 'Sport' });
      },
    });
    renderAt('/');
    await screen.findByTestId('habit-1');
    await userEvent.click(screen.getByRole('button', { name: 'Voir les archivées' }));
    const item = await screen.findByTestId('archived-2');
    expect(screen.queryByTestId('archived-1')).not.toBeInTheDocument();
    await userEvent.click(within(item).getByRole('button', { name: 'Désarchiver Sport' }));
    expect(await screen.findByTestId('habit-2')).toBeInTheDocument();
    expect(screen.getByText('« Sport » désarchivée.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('archived-2')).not.toBeInTheDocument());
    expect(f.calls.filter((c) => c.url.startsWith('/api/checkins')).length).toBe(2);
  });
});

describe('<App /> language switcher', () => {
  afterEach(() => setLang('fr'));

  it('offers English and French, defaults to French and switches the whole UI', async () => {
    mockFetch({ 'GET /api/habits': () => [habit()], 'GET /api/checkins': () => [], ...STATS });
    renderAt('/');
    const select = screen.getByRole('combobox', { name: 'Langue' });
    expect([...select.options].map((o) => o.textContent)).toEqual(['English', 'French']);
    expect(select).toHaveValue('fr');
    expect(await screen.findByRole('heading', { level: 1, name: 'Mes habitudes' })).toBeInTheDocument();

    await userEvent.selectOptions(select, 'en');
    expect(await screen.findByRole('heading', { level: 1, name: 'My habits' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ New habit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'not scheduled' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('Habits');
    expect(localStorage.getItem('lang')).toBe('en');
  });

  it('keeps the language when navigating to the dashboard and translates it', async () => {
    mockFetch({ 'GET /api/habits': () => [habit()], 'GET /api/checkins': () => [], ...STATS });
    renderAt('/');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Langue' }), 'en');
    await userEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText('Best streak')).toBeInTheDocument();
    expect(screen.getByText('30-day rate')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('translates an already-mounted dashboard when the language changes', async () => {
    mockFetch({ 'GET /api/habits': () => [habit()], 'GET /api/checkins': () => [], ...STATS });
    renderAt('/dashboard');
    expect(await screen.findByText('Meilleure série', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Activité 2026')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Langue' }), 'en');
    expect(await screen.findByText('Best streak')).toBeInTheDocument();
    expect(screen.getByText('Activity 2026')).toBeInTheDocument();
    expect(screen.queryByText('Meilleure série')).not.toBeInTheDocument();
    expect(screen.queryByText('Activité 2026')).not.toBeInTheDocument();
  });

  it('translates validation messages and switches back to French', async () => {
    mockFetch({ 'GET /api/habits': () => [], 'GET /api/checkins': () => [] });
    renderAt('/');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Langue' }), 'en');
    await userEvent.click(await screen.findByRole('button', { name: 'Create my first habit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Name is required.')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'fr');
    expect(screen.getByRole('button', { name: 'Créer' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
  });
});
