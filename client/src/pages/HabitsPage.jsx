import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api.js';
import { lastSevenDays, toDateKey } from '../dates.js';
import HabitForm from '../components/HabitForm.jsx';
import HabitRow from '../components/HabitRow.jsx';

const cellKey = (habitId, date) => `${habitId}|${date}`;

export default function HabitsPage() {
  // La grille suit le changement de jour (minuit, onglet resté ouvert, veille).
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  const days = useMemo(() => lastSevenDays(), [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [habits, setHabits] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  const [pending, setPending] = useState(() => new Set());
  const [rowErrors, setRowErrors] = useState({});
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  // null = fermé, { habit: null } = création, { habit } = modification
  const [editing, setEditing] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState({ status: 'idle', items: [], error: null });
  const errorTimers = useRef({});

  const load = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    try {
      const [list, checkins] = await Promise.all([api.getHabits(), api.getCheckins(days[0].key, days[6].key)]);
      setHabits(list);
      setChecked(new Set(checkins.map((c) => cellKey(c.habitId, c.date))));
      setStatus('ready');
    } catch (err) {
      setLoadError(err.message);
      setStatus('error');
    }
  }, [days]);

  const loadArchived = useCallback(async () => {
    setArchived((a) => ({ ...a, status: 'loading', error: null }));
    try {
      const all = await api.getHabits({ includeArchived: true });
      setArchived({ status: 'ready', items: all.filter((h) => h.archived), error: null });
    } catch (err) {
      setArchived({ status: 'error', items: [], error: err.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const refresh = () => setTodayKey(toDateKey(new Date()));
    const timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    if (showArchived) loadArchived();
  }, [showArchived, loadArchived]);

  useEffect(() => {
    const timers = errorTimers.current;
    return () => Object.values(timers).forEach(clearTimeout);
  }, []);

  function showRowError(habitId, message) {
    setRowErrors((e) => ({ ...e, [habitId]: message }));
    clearTimeout(errorTimers.current[habitId]);
    errorTimers.current[habitId] = setTimeout(() => {
      setRowErrors((e) => {
        const next = { ...e };
        delete next[habitId];
        return next;
      });
    }, 5000);
  }

  function patchHabit(id, fields) {
    setHabits((list) => list.map((h) => (h.id === id ? { ...h, ...fields } : h)));
  }

  // Mise à jour optimiste : la case change tout de suite, rollback si l'API échoue.
  async function toggle(habit, date, done) {
    const key = cellKey(habit.id, date);
    const setCell = (value) =>
      setChecked((prev) => {
        const next = new Set(prev);
        if (value) next.add(key);
        else next.delete(key);
        return next;
      });
    const setCellPending = (value) =>
      setPending((prev) => {
        const next = new Set(prev);
        if (value) next.add(key);
        else next.delete(key);
        return next;
      });

    setCell(done);
    setCellPending(true);
    try {
      const res = done ? await api.checkIn(habit.id, date) : await api.uncheckIn(habit.id, date);
      setCell(res.done);
      patchHabit(habit.id, { currentStreak: res.currentStreak, bestStreak: res.bestStreak });
    } catch (err) {
      setCell(!done);
      showRowError(habit.id, `Impossible d'enregistrer : ${err.message}`);
    } finally {
      setCellPending(false);
    }
  }

  async function handleSubmit(payload) {
    if (editing.habit) {
      const updated = await api.updateHabit(editing.habit.id, payload);
      patchHabit(updated.id, updated);
      setNotice(`« ${updated.name} » modifiée.`);
    } else {
      const created = await api.createHabit(payload);
      setHabits((list) => [...list, created].sort((a, b) => a.id - b.id));
      setNotice(`« ${created.name} » créée.`);
    }
    setEditing(null);
  }

  async function handleArchive(habit) {
    if (!window.confirm(`Archiver « ${habit.name} » ? Elle n'apparaîtra plus dans la grille.`)) return;
    try {
      await api.archiveHabit(habit.id);
      setHabits((list) => list.filter((h) => h.id !== habit.id));
      if (editing?.habit?.id === habit.id) setEditing(null);
      setNotice(`« ${habit.name} » archivée.`);
      if (showArchived) loadArchived();
    } catch (err) {
      showRowError(habit.id, `Archivage impossible : ${err.message}`);
    }
  }

  async function handleUnarchive(habit) {
    try {
      const restored = await api.unarchiveHabit(habit.id);
      setArchived((a) => ({ ...a, items: a.items.filter((h) => h.id !== habit.id) }));
      setNotice(`« ${restored.name} » désarchivée.`);
      // Recharge la grille pour récupérer les check-ins de l'habitude restaurée.
      load();
    } catch (err) {
      setArchived((a) => ({ ...a, error: `Désarchivage impossible : ${err.message}` }));
    }
  }

  return (
    <div className="habits-page">
      <div className="page-head">
        <div>
          <h1>Mes habitudes</h1>
          <p className="text-muted">Les 7 derniers jours. Touchez une case pour cocher ou décocher.</p>
        </div>
        {!editing && (
          <button type="button" className="btn btn--primary" onClick={() => setEditing({ habit: null })}>
            + Nouvelle habitude
          </button>
        )}
      </div>

      {notice && (
        <p className="alert alert--info" role="status">
          {notice}
          <button type="button" className="alert__close" onClick={() => setNotice(null)} aria-label="Fermer le message">
            ×
          </button>
        </p>
      )}

      {editing && (
        <HabitForm
          key={editing.habit?.id ?? 'new'}
          habit={editing.habit}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(null)}
        />
      )}

      {status === 'loading' && (
        <p className="state" role="status">
          Chargement des habitudes…
        </p>
      )}

      {status === 'error' && (
        <div className="state state--error" role="alert">
          <p>Impossible de charger les habitudes : {loadError}</p>
          <button type="button" className="btn" onClick={load}>
            Réessayer
          </button>
        </div>
      )}

      {status === 'ready' && habits.length === 0 && (
        <div className="state">
          <p>Aucune habitude active pour le moment.</p>
          {!editing && (
            <button type="button" className="btn btn--primary" onClick={() => setEditing({ habit: null })}>
              Créer ma première habitude
            </button>
          )}
        </div>
      )}

      {status === 'ready' && habits.length > 0 && (
        <>
          <ul className="habit-list" aria-label="Habitudes actives">
            {habits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                days={days}
                isChecked={(date) => checked.has(cellKey(habit.id, date))}
                isPending={(date) => pending.has(cellKey(habit.id, date))}
                onToggle={(date, done) => toggle(habit, date, done)}
                onEdit={() => setEditing({ habit })}
                onArchive={() => handleArchive(habit)}
                error={rowErrors[habit.id]}
              />
            ))}
          </ul>
          <p className="legend text-muted">
            <span className="legend__swatch week-cell is-checked" aria-hidden="true">✓</span> fait
            <span className="legend__swatch week-cell" aria-hidden="true" /> prévu
            <span className="legend__swatch week-cell is-unscheduled" aria-hidden="true" /> non prévu
          </p>
        </>
      )}

      <section className="archived" aria-label="Archives">
        <button
          type="button"
          className="btn btn--ghost"
          aria-expanded={showArchived}
          aria-controls="archived-panel"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? 'Masquer les archivées' : 'Voir les archivées'}
        </button>
        {showArchived && (
          <div id="archived-panel">
            <h2 id="archived-title">Habitudes archivées</h2>
            {archived.status === 'loading' && <p className="state" role="status">Chargement…</p>}
            {archived.error && (
              <div className="state state--error" role="alert">
                <p>{archived.error}</p>
                <button type="button" className="btn" onClick={loadArchived}>
                  Réessayer
                </button>
              </div>
            )}
            {archived.status === 'ready' && archived.items.length === 0 && (
              <p className="state">Aucune habitude archivée.</p>
            )}
            {archived.items.length > 0 && (
              <ul className="archived-list" aria-label="Habitudes archivées">
                {archived.items.map((h) => (
                  <li key={h.id} className="card archived-item" data-testid={`archived-${h.id}`}>
                    <span aria-hidden="true">{h.icon}</span>
                    <span className="archived-item__name">{h.name}</span>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => handleUnarchive(h)}
                      aria-label={`Désarchiver ${h.name}`}
                    >
                      Désarchiver
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
