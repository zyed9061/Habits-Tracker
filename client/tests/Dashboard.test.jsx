import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '../src/dashboard/DashboardPage.jsx';
import KpiCards from '../src/dashboard/KpiCards.jsx';
import { formatRate } from '../src/dashboard/format.js';
import { mockFetch } from './fetchMock.js';

beforeAll(() => {
  // Recharts' ResponsiveContainer needs ResizeObserver, absent from jsdom.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
});

const SUMMARY = {
  activeHabits: 4,
  todayRate: 0.5,
  todayCompleted: 1,
  todayScheduled: 2,
  bestStreak: { value: 12, habitId: 1, habitName: 'Lire' },
  rate30d: 0.7333333333,
};

const kpi = (label) => screen.getByText(label).closest('.dv-kpi');

describe('formatRate', () => {
  it('formats rates as rounded percentages, null as a dash', () => {
    // the space may be a (narrow) no-break space
    const fr = (r) => formatRate(r).replace(/\s/g, ' ');
    expect(fr(0.7333)).toBe('73 %');
    expect(fr(2 / 3)).toBe('67 %');
    expect(fr(1)).toBe('100 %');
    expect(fr(0)).toBe('0 %');
    expect(formatRate(null)).toBe('—');
  });
});

describe('<KpiCards />', () => {
  it('renders the 4 KPIs from the summary', () => {
    render(<KpiCards state={{ data: SUMMARY, loading: false, error: null, reload: vi.fn() }} />);
    expect(within(kpi('Habitudes actives')).getByText('4')).toBeInTheDocument();
    expect(within(kpi('Complétion du jour')).getByText('50 %')).toBeInTheDocument();
    expect(within(kpi('Complétion du jour')).getByText('1/2 cochées')).toBeInTheDocument();
    expect(within(kpi('Meilleure série')).getByText('12 j')).toBeInTheDocument();
    expect(within(kpi('Meilleure série')).getByText('Lire')).toBeInTheDocument();
    expect(within(kpi('Taux sur 30 jours')).getByText('73 %')).toBeInTheDocument();
  });

  it('handles null rates and no active habit', () => {
    const empty = { activeHabits: 0, todayRate: null, todayCompleted: 0, todayScheduled: 0, bestStreak: null, rate30d: null };
    render(<KpiCards state={{ data: empty, loading: false, error: null, reload: vi.fn() }} />);
    expect(within(kpi('Complétion du jour')).getByText('—')).toBeInTheDocument();
    expect(within(kpi('Complétion du jour')).getByText('Rien de prévu aujourd’hui')).toBeInTheDocument();
    expect(within(kpi('Meilleure série')).getByText('—')).toBeInTheDocument();
    expect(within(kpi('Taux sur 30 jours')).getByText('—')).toBeInTheDocument();
    expect(screen.getByText(/Aucune habitude active/)).toBeInTheDocument();
  });

  it('shows a busy skeleton while loading', () => {
    const { container } = render(<KpiCards state={{ data: null, loading: true, error: null, reload: vi.fn() }} />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('shows the error with a retry button', async () => {
    const reload = vi.fn();
    render(<KpiCards state={{ data: null, loading: false, error: new Error('Serveur injoignable'), reload }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Serveur injoignable');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(reload).toHaveBeenCalled();
  });
});

describe('<DashboardPage />', () => {
  const heatmapDays = [
    { date: '2026-10-07', completed: 2, scheduled: 2, rate: 1 },
    { date: '2026-10-08', completed: 1, scheduled: 2, rate: 0.5 },
  ];
  const routes = () => ({
    'GET /api/stats/summary': () => SUMMARY,
    'GET /api/stats/heatmap': () => ({ year: 2026, days: heatmapDays }),
    'GET /api/stats/daily': () => heatmapDays,
    'GET /api/stats/weekday': () => Array.from({ length: 7 }, (_, i) => ({ weekday: i, completed: 1, scheduled: 2, rate: 0.5 })),
    'GET /api/stats/ranking': () => [
      { habitId: 1, name: 'Lire', color: '#4F46E5', icon: '📚', completed: 6, scheduled: 7, rate: 6 / 7, currentStreak: 4 },
    ],
  });

  it('loads every stats endpoint with the contract parameters and shows the KPIs', async () => {
    const f = mockFetch(routes());
    render(<DashboardPage />);
    await screen.findByText('Complétion du jour');
    expect(within(kpi('Complétion du jour')).getByText('50 %')).toBeInTheDocument();
    const urls = f.calls.map((c) => c.url).sort();
    expect(urls).toEqual([
      '/api/stats/daily?days=30',
      '/api/stats/heatmap?year=2026',
      '/api/stats/ranking?days=30',
      '/api/stats/summary',
      '/api/stats/weekday?weeks=12',
    ]);
    expect(screen.getByRole('grid', { name: /Calendrier 2026 : 3 complétions sur 4 prévues \(75\s%\)/ })).toBeInTheDocument();
  });

  it('[QA-D1] heatmap is keyboard navigable with one tab stop and labelled cells', async () => {
    mockFetch(routes());
    render(<DashboardPage />);
    const grid = await screen.findByRole('grid', { name: /Calendrier 2026/ });
    const focusable = within(grid).getAllByRole('gridcell').filter((c) => c.tabIndex === 0);
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toHaveAccessibleName(/jeudi 8 octobre 2026 : 1 sur 2 cochées, 50\s%/);
    focusable[0].focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toHaveAccessibleName(/mercredi 7 octobre 2026 : 2 sur 2 cochées, 100\s%/);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    // cannot move past the last known day
    expect(document.activeElement).toHaveAccessibleName(/jeudi 8 octobre 2026/);
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toHaveAccessibleName(/jeudi 1 octobre 2026/); // previous week, same weekday
  });

  it('[QA-D2] switching year clears the old heatmap while loading', async () => {
    let resolve2025;
    mockFetch({
      ...routes(),
      'GET /api/stats/heatmap?year=2025': () => new Promise((r) => { resolve2025 = r; }),
    });
    render(<DashboardPage />);
    await screen.findByRole('grid', { name: /Calendrier 2026/ });
    await userEvent.click(screen.getByRole('button', { name: 'Année précédente' }));
    expect(screen.queryByRole('grid', { name: /Calendrier 2026/ })).not.toBeInTheDocument();
    resolve2025({ year: 2025, days: [{ date: '2025-06-02', completed: 1, scheduled: 1, rate: 1 }] });
    expect(await screen.findByRole('grid', { name: /Calendrier 2025/ })).toBeInTheDocument();
  });

  it('[QA-D4] each chart offers a data table alternative', async () => {
    mockFetch(routes());
    render(<DashboardPage />);
    await screen.findByText('Complétion du jour');
    expect(await screen.findByRole('table', { name: 'Complétion sur 30 jours' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Taux par jour de la semaine/ })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Classement des habitudes sur 30 jours' })).toBeInTheDocument();
  });

  it('an error in one block does not break the others', async () => {
    mockFetch({ ...routes(), 'GET /api/stats/weekday': () => ({ status: 500, body: { error: { message: 'Erreur interne du serveur' } } }) });
    render(<DashboardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur interne du serveur');
    expect(within(kpi('Complétion du jour')).getByText('50 %')).toBeInTheDocument();
  });

  it('shows empty states when nothing is scheduled', async () => {
    mockFetch({
      ...routes(),
      'GET /api/stats/heatmap': () => ({ year: 2026, days: [{ date: '2026-01-01', completed: 0, scheduled: 0, rate: null }] }),
      'GET /api/stats/ranking': () => [],
    });
    render(<DashboardPage />);
    expect(await screen.findByText('Aucune habitude prévue en 2026.')).toBeInTheDocument();
  });

  it('year navigation requests the previous year and cannot go past the current year', async () => {
    const f = mockFetch(routes());
    render(<DashboardPage />);
    await screen.findByText('Complétion du jour');
    expect(screen.getByRole('button', { name: 'Année suivante' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Année précédente' }));
    await vi.waitFor(() => expect(f.calls.some((c) => c.url === '/api/stats/heatmap?year=2025')).toBe(true));
  });
});
