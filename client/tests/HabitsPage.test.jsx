import '@testing-library/jest-dom/vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HabitsPage from '../src/pages/HabitsPage.jsx';
import { deferred, habit, mockFetch } from './fetchMock.js';

// Thu 2026-10-08, local noon: the grid shows Fri 10-02 … Thu 10-08.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const row = (id = 1) => screen.getByTestId(`habit-${id}`);
const cell = (date, id = 1) => row(id).querySelector(`button[data-date="${date}"]`);

describe('<HabitsPage /> states', () => {
  it('shows a loading state then the empty state', async () => {
    const habits = deferred();
    mockFetch({ 'GET /api/habits': () => habits.promise, 'GET /api/checkins': () => [] });
    render(<HabitsPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement des habitudes');
    await act(async () => habits.resolve([]));
    expect(await screen.findByText('Aucune habitude active pour le moment.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer ma première habitude' })).toBeInTheDocument();
  });

  it('shows the server error and retries', async () => {
    let fail = true;
    const f = mockFetch({
      'GET /api/habits': () => (fail ? { status: 500, body: { error: { message: 'Erreur interne du serveur' } } } : [habit()]),
      'GET /api/checkins': () => [],
    });
    render(<HabitsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Erreur interne du serveur');
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByTestId('habit-1')).toBeInTheDocument();
    expect(f.calls.filter((c) => c.url.startsWith('/api/habits')).length).toBe(2);
  });

  it('shows a network error message when the server is unreachable', async () => {
    mockFetch({
      'GET /api/habits': () => {
        throw new TypeError('Failed to fetch');
      },
      'GET /api/checkins': () => [],
    });
    render(<HabitsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Serveur injoignable');
  });
});

describe('<HabitsPage /> check-in grid', () => {
  it('requests the last 7 local days and renders checked cells', async () => {
    const f = mockFetch({
      'GET /api/habits': () => [habit()],
      'GET /api/checkins': () => [{ habitId: 1, date: '2026-10-07' }],
    });
    render(<HabitsPage />);
    await screen.findByTestId('habit-1');
    const checkinsCall = f.calls.find((c) => c.url.startsWith('/api/checkins'));
    expect(checkinsCall.url).toBe('/api/checkins?from=2026-10-02&to=2026-10-08');
    const dates = [...row().querySelectorAll('button[data-date]')].map((b) => b.dataset.date);
    expect(dates).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
    expect(cell('2026-10-07')).toHaveAttribute('aria-pressed', 'true');
    expect(cell('2026-10-08')).toHaveAttribute('aria-pressed', 'false');
    expect(within(row()).getByTestId('current-streak')).toHaveTextContent('2');
  });

  it('marks non-scheduled days using 0 = Monday (Sunday 10-04 for a Mon/Wed/Fri habit)', async () => {
    mockFetch({
      'GET /api/habits': () => [habit({ frequency: { type: 'weekdays', days: [0, 2, 4] }, weeklyGoal: 3 })],
      'GET /api/checkins': () => [],
    });
    render(<HabitsPage />);
    await screen.findByTestId('habit-1');
    expect(cell('2026-10-02')).toHaveAttribute('data-scheduled', 'true'); // Fri
    expect(cell('2026-10-04')).toHaveAttribute('data-scheduled', 'false'); // Sun
    expect(cell('2026-10-05')).toHaveAttribute('data-scheduled', 'true'); // Mon
    expect(cell('2026-10-08')).toHaveAttribute('data-scheduled', 'false'); // Thu
  });

  it('updates optimistically, then applies the server streaks', async () => {
    const put = deferred();
    const f = mockFetch({
      'GET /api/habits': () => [habit()],
      'GET /api/checkins': () => [{ habitId: 1, date: '2026-10-07' }],
      'PUT /api/habits/:id/checkins/:date': () => put.promise,
    });
    render(<HabitsPage />);
    await screen.findByTestId('habit-1');

    await userEvent.click(cell('2026-10-08'));
    // optimistic: checked before the server answers
    expect(cell('2026-10-08')).toHaveAttribute('aria-pressed', 'true');
    expect(f.calls.at(-1)).toMatchObject({ method: 'PUT', url: '/api/habits/1/checkins/2026-10-08' });

    await act(async () => put.resolve({ habitId: 1, date: '2026-10-08', done: true, currentStreak: 3, bestStreak: 5 }));
    await waitFor(() => expect(within(row()).getByTestId('current-streak')).toHaveTextContent('3'));
    expect(cell('2026-10-08')).toHaveAttribute('aria-pressed', 'true');
    expect(cell('2026-10-08')).toBeEnabled();
  });

  it('rolls back the check and shows the error when the API fails', async () => {
    const put = deferred();
    mockFetch({
      'GET /api/habits': () => [habit()],
      'GET /api/checkins': () => [],
      'PUT /api/habits/:id/checkins/:date': () => put.promise,
    });
    render(<HabitsPage />);
    await screen.findByTestId('habit-1');

    await userEvent.click(cell('2026-10-08'));
    expect(cell('2026-10-08')).toHaveAttribute('aria-pressed', 'true');
    await act(async () => put.resolve({ status: 400, body: { error: { message: 'Impossible de cocher une date dans le futur' } } }));

    await waitFor(() => expect(cell('2026-10-08')).toHaveAttribute('aria-pressed', 'false'));
    expect(within(row()).getByRole('alert')).toHaveTextContent('Impossible de cocher une date dans le futur');
    expect(within(row()).getByTestId('current-streak')).toHaveTextContent('2'); // unchanged
  });

  it('rolls back an uncheck on network failure', async () => {
    mockFetch({
      'GET /api/habits': () => [habit()],
      'GET /api/checkins': () => [{ habitId: 1, date: '2026-10-07' }],
      'DELETE /api/habits/:id/checkins/:date': () => {
        throw new TypeError('Failed to fetch');
      },
    });
    render(<HabitsPage />);
    await screen.findByTestId('habit-1');
    await userEvent.click(cell('2026-10-07'));
    await waitFor(() => expect(cell('2026-10-07')).toHaveAttribute('aria-pressed', 'true'));
    expect(within(row()).getByRole('alert')).toHaveTextContent('Serveur injoignable');
  });

  it('[QA-F1] moves the grid to the new day after midnight (on focus) and reloads', async () => {
    const f = mockFetch({ 'GET /api/habits': () => [habit()], 'GET /api/checkins': () => [] });
    render(<HabitsPage />);
    await screen.findByTestId('habit-1');
    vi.setSystemTime(new Date(2026, 9, 9, 0, 5, 0));
    await act(async () => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(cell('2026-10-09')).not.toBeNull());
    expect(cell('2026-10-02')).toBeNull();
    expect(f.calls.some((c) => c.url === '/api/checkins?from=2026-10-03&to=2026-10-09')).toBe(true);
  });

  it('[QA-F5] check mark colour contrasts with the habit colour', async () => {
    mockFetch({
      'GET /api/habits': () => [habit({ color: '#F59E0B' }), habit({ id: 2, name: 'Nuit', color: '#1E1B4B' })],
      'GET /api/checkins': () => [],
    });
    render(<HabitsPage />);
    await screen.findByTestId('habit-1');
    expect(row(1).style.getPropertyValue('--habit-on')).toBe('#000000');
    expect(row(2).style.getPropertyValue('--habit-on')).toBe('#FFFFFF');
  });

  it('creates a habit through the form and adds it to the list', async () => {
    const f = mockFetch({
      'GET /api/habits': () => [],
      'GET /api/checkins': () => [],
      'POST /api/habits': ({ body }) => ({ status: 201, body: habit({ id: 7, ...body, currentStreak: 0, bestStreak: 0 }) }),
    });
    render(<HabitsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Créer ma première habitude' }));
    await userEvent.type(screen.getByLabelText('Nom'), 'Courir');
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(await screen.findByTestId('habit-7')).toBeInTheDocument();
    expect(f.calls.find((c) => c.method === 'POST').body).toMatchObject({ name: 'Courir', frequency: { type: 'daily' } });
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('archives a habit after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockFetch({
      'GET /api/habits': () => [habit(), habit({ id: 2, name: 'Sport' })],
      'GET /api/checkins': () => [],
      'POST /api/habits/:id/archive': () => habit({ archived: true }),
    });
    render(<HabitsPage />);
    await screen.findByTestId('habit-1');
    await userEvent.click(screen.getByRole('button', { name: 'Archiver Lire' }));
    await waitFor(() => expect(screen.queryByTestId('habit-1')).not.toBeInTheDocument());
    expect(screen.getByTestId('habit-2')).toBeInTheDocument();
  });
});
