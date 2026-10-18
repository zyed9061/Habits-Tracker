import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api.js';
import { lastSevenDays, toDateKey } from '../dates.js';
import { useI18n } from '../i18n/index.js';
import HabitForm from '../components/HabitForm.jsx';
import HabitRow from '../components/HabitRow.jsx';

const DAY_REFRESH_MS = 60_000;
const ROW_ERROR_MS = 5000;

// Légende interactive : un clic met en évidence les cases correspondantes (un second clic annule).
const LEGEND_ITEMS = [
  { id: 'done', swatch: 'is-checked' },
  { id: 'scheduled', swatch: '' },
  { id: 'unscheduled', swatch: 'is-unscheduled' },
];

const cellKey = (habitId, date) => `${habitId}|${date}`;

// Ajoute ou retire `key` d'un Set d'état (copie immuable).
const withMember = (set, key, value) => {
  const next = new Set(set);
  if (value) next.add(key);
  else next.delete(key);
  return next;
};

export default function HabitsPage() {
  const { t } = useI18n();
  // notice, rowErrors et archived.error stockent un descripteur { key, params } traduit au rendu,
  // pour suivre un changement de langue.
  const tr = (d) => d && t(d.key, d.params);
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

  function showRowError(habitId, descriptor) {
    setRowErrors((e) => ({ ...e, [habitId]: descriptor }));
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
      showRowError(habit.id, { key: 'habits.saveFailed', params: { error: err.message } });
    } finally {
      setCellPending(false);
    }
  }

  async function handleSubmit(payload) {
    if (editing.habit) {
      const updated = await api.updateHabit(editing.habit.id, payload);
      patchHabit(updated.id, updated);
      setNotice({ key: 'habits.updated', params: { name: updated.name } });
    } else {
      const created = await api.createHabit(payload);
      setHabits((list) => [...list, created].sort((a, b) => a.id - b.id));
      setNotice({ key: 'habits.created', params: { name: created.name } });
    }
    setEditing(null);
  }

  async function handleArchive(habit) {
    if (!window.confirm(t('habits.confirmArchive', { name: habit.name }))) return;
    try {
      await api.archiveHabit(habit.id);
      setHabits((list) => list.filter((h) => h.id !== habit.id));
      if (editing?.habit?.id === habit.id) setEditing(null);
      setNotice({ key: 'habits.archived', params: { name: habit.name } });
      if (showArchived) loadArchived();
    } catch (err) {
      showRowError(habit.id, { key: 'habits.archiveFailed', params: { error: err.message } });
    }
  }

  async function handleUnarchive(habit) {
    try {
      const restored = await api.unarchiveHabit(habit.id);
      setArchived((a) => ({ ...a, items: a.items.filter((h) => h.id !== habit.id) }));
      setNotice({ key: 'habits.unarchived', params: { name: restored.name } });
      // Recharge la grille pour récupérer les check-ins de l'habitude restaurée.
      load();
    } catch (err) {
      setArchived((a) => ({ ...a, error: { key: 'habits.unarchiveFailed', params: { error: err.message } } }));
    }
  }

  return (
    <div className="habits-page">
      <div className="page-head">
        <div>
          <h1>{t('habits.title')}</h1>
          <p className="text-muted">{t('habits.lead')}</p>
        </div>
        {!editing && (
          <button type="button" className="btn btn--primary" onClick={() => setEditing({ habit: null })}>
            {t('habits.new')}
          </button>
        )}
      </div>

      {notice && (
        <p className="alert alert--info" role="status">
          {tr(notice)}
          <button type="button" className="alert__close" onClick={() => setNotice(null)} aria-label={t('habits.closeMessage')}>
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
          {t('habits.loading')}
        </p>
      )}

      {status === 'error' && (
        <div className="state state--error" role="alert">
          <p>{t('habits.loadError', { error: loadError })}</p>
          <button type="button" className="btn" onClick={load}>
            {t('habits.retry')}
          </button>
        </div>
      )}

      {status === 'ready' && habits.length === 0 && (
        <div className="state">
          <p>{t('habits.empty')}</p>
          {!editing && (
            <button type="button" className="btn btn--primary" onClick={() => setEditing({ habit: null })}>
              {t('habits.createFirst')}
            </button>
          )}
        </div>
      )}

      {status === 'ready' && habits.length > 0 && (
        <>
          <ul className="habit-list" aria-label={t('habits.activeList')} data-highlight={highlight ?? undefined}>
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
                error={tr(rowErrors[habit.id])}
              />
            ))}
          </ul>
          <div className="legend" role="group" aria-label={t('legend.group')}>
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
                {t(`legend.${item.id}`)}
              </button>
            ))}
          </div>
        </>
      )}

      <section className="archived" aria-label={t('habits.archivesSection')}>
        <button
          type="button"
          className="btn btn--ghost"
          aria-expanded={showArchived}
          aria-controls="archived-panel"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? t('habits.hideArchived') : t('habits.showArchived')}
        </button>
        {showArchived && (
          <div id="archived-panel">
            <h2 id="archived-title">{t('habits.archivedList')}</h2>
            {archived.status === 'loading' && <p className="state" role="status">{t('habits.archivedLoading')}</p>}
            {archived.error && (
              <div className="state state--error" role="alert">
                <p>{tr(archived.error)}</p>
                <button type="button" className="btn" onClick={loadArchived}>
                  {t('habits.retry')}
                </button>
              </div>
            )}
            {archived.status === 'ready' && archived.items.length === 0 && (
              <p className="state">{t('habits.archivedEmpty')}</p>
            )}
            {archived.items.length > 0 && (
              <ul className="archived-list" aria-label={t('habits.archivedList')}>
                {archived.items.map((h) => (
                  <li key={h.id} className="card archived-item" data-testid={`archived-${h.id}`}>
                    <span aria-hidden="true">{h.icon}</span>
                    <span className="archived-item__name">{h.name}</span>
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => handleUnarchive(h)}
                      aria-label={t('habits.unarchiveAria', { name: h.name })}
                    >
                      {t('habits.unarchive')}
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
