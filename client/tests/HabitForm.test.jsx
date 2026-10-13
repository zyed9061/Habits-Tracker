import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import HabitForm, { validateHabit } from '../src/components/HabitForm.jsx';
import { habit } from './fetchMock.js';

const valid = { name: 'Lire', color: '#4F46E5', icon: '📚', type: 'daily', days: [0, 1, 2, 3, 4, 5, 6], weeklyGoal: 7 };

describe('validateHabit (mirrors contract §3)', () => {
  it('accepts a valid habit', () => {
    expect(validateHabit(valid)).toEqual({});
  });

  it.each([
    ['name', { name: '   ' }],
    ['name', { name: 'x'.repeat(61) }],
    ['color', { color: '#FFF' }],
    ['color', { color: 'red' }],
    ['icon', { icon: '' }],
    ['icon', { icon: '123456789' }],
    ['days', { type: 'weekdays', days: [] }],
    ['weeklyGoal', { weeklyGoal: 0 }],
    ['weeklyGoal', { weeklyGoal: 8 }],
    ['weeklyGoal', { weeklyGoal: 2.5 }],
    ['weeklyGoal', { type: 'weekdays', days: [0, 2], weeklyGoal: 3 }],
  ])('rejects invalid %s', (field, overrides) => {
    expect(validateHabit({ ...valid, ...overrides })).toHaveProperty(field);
  });

  it('accepts a 60-char name after trim', () => {
    expect(validateHabit({ ...valid, name: `  ${'x'.repeat(60)}  ` })).toEqual({});
  });

  it('counts the name length in code points, like the server (31 emoji = 62 UTF-16 units)', () => {
    expect(validateHabit({ ...valid, name: '🏃'.repeat(31) })).toEqual({});
    expect(validateHabit({ ...valid, name: '🏃'.repeat(60) })).toEqual({});
    expect(validateHabit({ ...valid, name: '🏃'.repeat(61) })).toHaveProperty('name');
  });

  // QA-F2 (fixed): icon length counted in code points, like the server.
  it('[QA-F2] accepts an emoji the server accepts (ZWJ family = 7 code points)', () => {
    expect(validateHabit({ ...valid, icon: '👨‍👩‍👧‍👦' })).toEqual({});
  });
});

describe('<HabitForm />', () => {
  it('shows a field error and does not submit when the name is empty', async () => {
    const onSubmit = vi.fn();
    render(<HabitForm habit={null} onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Le nom est obligatoire.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom')).toHaveAttribute('aria-invalid', 'true');
  });

  it('submits a contract-shaped payload for a weekdays habit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<HabitForm habit={null} onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText('Nom'), '  Sport  ');
    await userEvent.click(screen.getByRole('button', { name: 'Icône 🏃' }));
    await userEvent.click(screen.getByRole('button', { name: 'Couleur #10B981' }));
    await userEvent.click(screen.getByLabelText('Jours précis'));
    // deselect everything except Monday, Wednesday, Friday
    for (const day of ['mardi', 'jeudi', 'samedi', 'dimanche']) {
      await userEvent.click(screen.getByRole('button', { name: day }));
    }
    await userEvent.click(screen.getByRole('button', { name: 'Créer' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toEqual({
      name: 'Sport',
      color: '#10B981',
      icon: '🏃',
      frequency: { type: 'weekdays', days: [0, 2, 4] },
      weeklyGoal: 3,
    });
  });

  it('caps the weekly goal to the number of selected days', async () => {
    render(<HabitForm habit={null} onSubmit={vi.fn()} onCancel={() => {}} />);
    await userEvent.click(screen.getByLabelText('Jours précis'));
    await userEvent.click(screen.getByRole('button', { name: 'lundi' }));
    await userEvent.click(screen.getByRole('button', { name: 'mardi' }));
    expect(Number(screen.getByLabelText('Objectif hebdomadaire (jours)').value)).toBeLessThanOrEqual(5);
  });

  it('requires at least one day for a weekdays habit', async () => {
    const onSubmit = vi.fn();
    render(<HabitForm habit={habit({ frequency: { type: 'weekdays', days: [0] }, weeklyGoal: 1 })} onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'lundi' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Choisissez au moins un jour.')).toBeInTheDocument();
  });

  it('pre-fills the form when editing', () => {
    render(<HabitForm habit={habit({ name: 'Méditer', weeklyGoal: 5 })} onSubmit={vi.fn()} onCancel={() => {}} />);
    expect(screen.getByRole('form', { name: "Modifier l'habitude" })).toBeInTheDocument();
    expect(screen.getByLabelText('Nom')).toHaveValue('Méditer');
    expect(screen.getByLabelText('Objectif hebdomadaire (jours)')).toHaveValue(5);
  });

  it('displays the server error message and re-enables the form', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('name doit contenir entre 1 et 60 caractères'));
    render(<HabitForm habit={habit()} onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('name doit contenir entre 1 et 60 caractères');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
  });

  it('[QA-F4] links every field error to its field with aria-describedby', async () => {
    render(<HabitForm habit={null} onSubmit={vi.fn()} onCancel={() => {}} />);
    await userEvent.clear(screen.getByLabelText('Icône'));
    await userEvent.click(screen.getByLabelText('Jours précis'));
    for (const day of ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']) {
      await userEvent.click(screen.getByRole('button', { name: day, exact: true }));
    }
    await userEvent.click(screen.getByRole('button', { name: 'Créer', exact: true }));
    const icon = screen.getByLabelText('Icône');
    expect(icon).toHaveAttribute('aria-invalid', 'true');
    expect(icon).toHaveAccessibleDescription('Choisissez un emoji.');
    expect(screen.getByRole('group', { name: 'Jours prévus' })).toHaveAccessibleDescription('Choisissez au moins un jour.');
    expect(document.getElementById('habit-icon-error')).toBeInTheDocument();
    expect(document.getElementById('habit-days-error')).toBeInTheDocument();
  });

  it('[QA-F4] goal error is described on the goal field', async () => {
    render(<HabitForm habit={null} onSubmit={vi.fn()} onCancel={() => {}} />);
    const goal = screen.getByLabelText('Objectif hebdomadaire (jours)');
    await userEvent.clear(goal);
    await userEvent.type(goal, '9');
    await userEvent.click(screen.getByRole('button', { name: 'Créer', exact: true }));
    expect(goal).toHaveAccessibleDescription('Objectif entre 1 et 7.');
    expect(document.getElementById('habit-goal-error')).toBeInTheDocument();
  });

  it('calls onCancel', async () => {
    const onCancel = vi.fn();
    render(<HabitForm habit={null} onSubmit={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
