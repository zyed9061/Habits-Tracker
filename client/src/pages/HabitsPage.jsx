import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api.js';
import { lastSevenDays, toDateKey } from '../dates.js';
import HabitForm from '../components/HabitForm.jsx';
import HabitRow from '../components/HabitRow.jsx';
import { describeError, useI18n } from '../i18n/I18nContext.jsx';

// Fréquence de vérification du changement de jour (minuit).
const DAY_REFRESH_MS = 60_000;
// Durée d'affichage d'une erreur de ligne (check-in, archivage).
const ROW_ERROR_MS = 5000;

// Légende interactive : un clic met en évidence les cases correspondantes (un second clic annule).
const LEGEND_ITEMS = [
  { id: 'done', labelKey: 'legendDone', swatch: 'is-checked' },
  { id: 'scheduled', labelKey: 'legendScheduled', swatch: '' },
  { id: 'unscheduled', labelKey: 'legendUnscheduled', swatch: 'is-unscheduled' },
];

const cellKey = (habitId, date) => `${habitId}|${date}`;

// Les messages affichés sont stockés en { key, name?, err? } et traduits au rendu :
// ils suivent un changement de langue.
function renderMessage(msg, t) {
  const text = t.habits[msg.key];
  return msg.err ? text(describeError(msg.err, t)) : text(msg.name);
}

// Ajoute ou retire `key` d'un Set d'état (copie immuable).
const withMember = (set, key, value) => {
  const next = new Set(set);
  if (value) next.add(key);
  else next.delete(key);
  return next;
};

export default function HabitsPage() {
  const { t } = useI18n();
  const h = t.habits;
  // La grille suit le changement de jour (minuit, onglet resté ouvert, veille).
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  const days = useMemo(() => lastSevenDays(), [todayKey]); // recalculé uniquement au changement de jour
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
  const [highlight, setHighlight] = useState(null); // null | done | scheduled | unscheduled
  const [archived, setArchived] = useState({ status: 'idle', items: [], error: null });
  const errorTimers = useRef({});
  // Bouton qui a ouvert le formulaire : il reprend le focus à la fermeture.
  const formOpener = useRef(null);
  const addButton = useRef(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    try {
      const [list, checkins] = await Promise.all([api.getHabits(), api.getCheckins(days[0].key, days[6].key)]);
      setHabits(list);
      setChecked(new Set(checkins.map((c) => cellKey(c.habitId, c.date))));
      setStatus('ready');
    } catch (err) {
      setLoadError(err);
      setStatus('error');
    }
  }, [days]);

  const loadArchived = useCallback(async () => {
    setArchived((a) => ({ ...a, status: 'loading', error: null }));
    try {
      const all = await api.getHabits({ includeArchived: true });
      setArchived({ status: 'ready', items: all.filter((h) => h.archived), error: null });
    } catch (err) {
      setArchived({ status: 'error', items: [], error: { key: 'archivedLoadFailed', err } });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (editing || !formOpener.current) return;
    const opener = formOpener.current;
    formOpener.current = null;
    (opener.isConnected ? opener : addButton.current)?.focus();
  }, [editing]);

  function openForm(habit) {
    formOpener.current = document.activeElement;
    setEditing({ habit });
  }

  useEffect(() => {
    const refresh = () => setTodayKey(toDateKey(new Date()));
    const timer = setInterval(refresh, DAY_REFRESH_MS);
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
    }, ROW_ERROR_MS);
  }

  function patchHabit(id, fields) {
    setHabits((list) => list.map((h) => (h.id === id ? { ...h, ...fields } : h)));
  }

  // Mise à jour optimiste : la case change tout de suite, rollback si l'API échoue.
  async function toggle(habit, date, done) {
    const key = cellKey(habit.id, date);
    const setCell = (value) => setChecked((prev) => withMember(prev, key, value));
    const setCellPending = (value) => setPending((prev) => withMember(prev, key, value));

    setCell(done);
    setCellPending(true);
    try {
      const res = done ? await api.checkIn(habit.id, date) : await api.uncheckIn(habit.id, date);
      setCell(res.done);
      patchHabit(habit.id, { currentStreak: res.currentStreak, bestStreak: res.bestStreak });
    } catch (err) {
      setCell(!done);
      showRowError(habit.id, { key: 'saveFailed', err });
    } finally {
      setCellPending(false);
    }
  }

  async function handleSubmit(payload) {
    if (editing.habit) {
      const updated = await api.updateHabit(editing.habit.id, payload);
      patchHabit(updated.id, updated);
      setNotice({ key: 'updated', name: updated.name });
    } else {
      const created = await api.createHabit(payload);
      setHabits((list) => [...list, created].sort((a, b) => a.id - b.id));
      setNotice({ key: 'created', name: created.name });
    }
    setEditing(null);
  }

  async function handleArchive(habit) {
    if (!window.confirm(h.confirmArchive(habit.name))) return;
    try {
      await api.archiveHabit(habit.id);
      setHabits((list) => list.filter((h) => h.id !== habit.id));
      if (editing?.habit?.id === habit.id) setEditing(null);
      setNotice({ key: 'archived', name: habit.name });
      if (showArchived) loadArchived();
    } catch (err) {
      showRowError(habit.id, { key: 'archiveFailed', err });
    }
  }

  async function handleUnarchive(habit) {
    try {
      const restored = await api.unarchiveHabit(habit.id);
      setArchived((a) => ({ ...a, items: a.items.filter((h) => h.id !== habit.id) }));
      setNotice({ key: 'unarchived', name: restored.name });
      // Recharge la grille pour récupérer les check-ins de l'habitude restaurée.
      load();
    } catch (err) {
      setArchived((a) => ({ ...a, error: { key: 'unarchiveFailed', err } }));
    }
  }

  return (
    <div className="habits-page">
      <div className="page-head">
        <div>
          <h1>{h.title}</h1>
          <p className="text-muted">{h.lead}</p>
        </div>
        {!editing && (
          <button type="button" className="btn btn--primary" ref={addButton} onClick={() => openForm(null)}>
            {h.add}
          </button>
        )}
      </div>

      {notice && (
        <p className="alert alert--info" role="status">
          {renderMessage(notice, t)}
          <button type="button" className="alert__close" onClick={() => setNotice(null)} aria-label={h.closeNotice}>
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
          {h.loading}
        </p>
      )}

      {status === 'error' && (
        <div className="state state--error" role="alert">
          <p>{h.loadError(describeError(loadError, t))}</p>
          <button type="button" className="btn" onClick={load}>
            {h.retry}
          </button>
        </div>
      )}

      {status === 'ready' && habits.length === 0 && (
        <div className="state">
          <p>{h.empty}</p>
          {!editing && (
            <button type="button" className="btn btn--primary" onClick={() => openForm(null)}>
              {h.createFirst}
            </button>
          )}
        </div>
      )}

      {status === 'ready' && habits.length > 0 && (
        <>
          <ul className="habit-list" aria-label={h.activeList} data-highlight={highlight ?? undefined}>
            {habits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                days={days}
                isChecked={(date) => checked.has(cellKey(habit.id, date))}
                isPending={(date) => pending.has(cellKey(habit.id, date))}
                onToggle={(date, done) => toggle(habit, date, done)}
                onEdit={() => openForm(habit)}
                onArchive={() => handleArchive(habit)}
                error={rowErrors[habit.id] && renderMessage(rowErrors[habit.id], t)}
              />
            ))}
          </ul>
          <div className="legend" role="group" aria-label={h.legendGroup}>
            {LEGEND_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="legend__item"
                aria-pressed={highlight === item.id}
                onClick={() => setHighlight((current) => (current === item.id ? null : item.id))}
              >
                <span className={`legend__swatch week-cell ${item.swatch}`} aria-hidden="true">
                  {item.id === 'done' ? '✓' : ''}
                </span>
                {h[item.labelKey]}
              </button>
            ))}
          </div>
        </>
      )}

      <section className="archived" aria-label={h.archives}>
        <button
          type="button"
          className="btn btn--ghost"
          aria-expanded={showArchived}
          aria-controls="archived-panel"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? h.hideArchived : h.showArchived}
        </button>
        {showArchived && (
          <div id="archived-panel">
            <h2 id="archived-title">{h.archivedTitle}</h2>
            {archived.status === 'loading' && <p className="state" role="status">{h.loadingShort}</p>}
            {archived.error && (
              <div className="state state--error" role="alert">
                <p>{renderMessage(archived.error, t)}</p>
                <button type="button" className="btn" onClick={loadArchived}>
                  {h.retry}
                </button>
              </div>
            )}
            {archived.status === 'ready' && archived.items.length === 0 && (
              <p className="state">{h.noArchived}</p>
            )}
            {archived.items.length > 0 && (
              <ul className="archived-list" aria-label={h.archivedTitle}>
                {archived.items.map((item) => (
                  <li key={item.id} className="card archived-item" data-testid={`archived-${item.id}`}>
                    <span aria-hidden="true">{item.icon}</span>
                    <span className="archived-item__name">{item.name}</span>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => handleUnarchive(item)}
                      aria-label={h.unarchiveNamed(item.name)}
                    >
                      {h.unarchive}
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
