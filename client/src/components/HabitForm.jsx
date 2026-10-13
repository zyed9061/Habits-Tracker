import { useState } from 'react';
import { t as translateNow, useI18n, weekdayLong, weekdayShort } from '../i18n/index.js';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const PRESET_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#64748B'];
const PRESET_ICONS = ['📚', '🏃', '💧', '🧘', '🥗', '💤', '✍️', '🎸'];
const NAME_MAX = 60;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function initialState(habit) {
  if (!habit) {
    return { name: '', color: PRESET_COLORS[0], icon: '✅', type: 'daily', days: ALL_DAYS, weeklyGoal: 7 };
  }
  return {
    name: habit.name,
    color: habit.color,
    icon: habit.icon,
    type: habit.frequency.type,
    days: habit.frequency.days,
    weeklyGoal: habit.weeklyGoal,
  };
}

// Mêmes règles que le contrat (section 3) pour éviter un aller-retour 400.
// `t` : traducteur des messages (langue courante par défaut).
export function validateHabit(values, t = translateNow) {
  const errors = {};
  const name = values.name.trim();
  if (name.length < 1) errors.name = t('form.err.nameRequired');
  else if (name.length > NAME_MAX) errors.name = t('form.err.nameMax', { max: NAME_MAX });
  if (!HEX_RE.test(values.color)) errors.color = t('form.err.color');
  const icon = values.icon.trim();
  // Compte en points de code, comme le serveur (un emoji composé reste valide).
  const iconLength = [...icon].length;
  if (iconLength < 1 || iconLength > 8) errors.icon = t('form.err.icon');
  const days = values.type === 'daily' ? ALL_DAYS : values.days;
  if (days.length === 0) errors.days = t('form.err.days');
  const goal = Number(values.weeklyGoal);
  if (!Number.isInteger(goal) || goal < 1 || goal > 7) errors.weeklyGoal = t('form.err.goalRange');
  else if (days.length > 0 && goal > days.length)
    errors.weeklyGoal = t('form.err.goalDays', { n: days.length });
  return errors;
}

export default function HabitForm({ habit, onSubmit, onCancel }) {
  const { t } = useI18n();
  const [values, setValues] = useState(() => initialState(habit));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(habit);
  const errorText = (e) => t(e.key, e.params);

  const scheduledCount = values.type === 'daily' ? 7 : values.days.length;

  function set(field, value) {
    setValues((v) => ({ ...v, [field]: value }));
  }

  function setType(type) {
    setValues((v) => {
      const days = type === 'daily' ? ALL_DAYS : v.days;
      return { ...v, type, days, weeklyGoal: Math.min(Number(v.weeklyGoal) || 1, Math.max(days.length, 1)) };
    });
  }

  function toggleDay(day) {
    setValues((v) => {
      const days = v.days.includes(day) ? v.days.filter((d) => d !== day) : [...v.days, day].sort((a, b) => a - b);
      // L'objectif suit le nombre de jours : il ne doit pas le dépasser.
      const goal = Number(v.weeklyGoal) || 1;
      // Sans jour : on garde l'objectif. Sinon on le ramène au nombre de jours s'il le dépasse
      // ou s'il suivait déjà l'ancien nombre de jours (objectif = « tous les jours prévus »).
      const weeklyGoal = days.length === 0 ? goal : goal > days.length || goal === v.days.length ? days.length : goal;
      return { ...v, days, weeklyGoal };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validateHabit(values, (key, params) => ({ key, params })); // clés : traduites au rendu (suit la langue)
    setErrors(errs);
    setSubmitError(null);
    if (Object.keys(errs).length > 0) return;
    const days = values.type === 'daily' ? ALL_DAYS : values.days;
    const payload = {
      name: values.name.trim(),
      color: values.color,
      icon: values.icon.trim(),
      frequency: { type: values.type, days },
      weeklyGoal: Number(values.weeklyGoal),
    };
    setSaving(true);
    try {
      await onSubmit(payload);
    } catch (err) {
      setSubmitError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="card habit-form" onSubmit={handleSubmit} aria-label={isEdit ? t('form.edit') : t('form.new')} noValidate>
      <h2 className="habit-form__title">{isEdit ? t('form.edit') : t('form.new')}</h2>

      <div className="field">
        <label htmlFor="habit-name">{t('form.name')}</label>
        <input
          id="habit-name"
          type="text"
          value={values.name}
          maxLength={80}
          onChange={(e) => set('name', e.target.value)}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'habit-name-error' : undefined}
          autoFocus
        />
        {errors.name && <p id="habit-name-error" className="field__error">{errorText(errors.name)}</p>}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="habit-icon">{t('form.icon')}</label>
          <input
            id="habit-icon"
            className="habit-form__icon-input"
            type="text"
            value={values.icon}
            onChange={(e) => set('icon', e.target.value)}
            aria-invalid={Boolean(errors.icon)}
            aria-describedby={errors.icon ? 'habit-icon-error' : undefined}
          />
          <div className="swatches" role="group" aria-label={t('form.iconSuggested')}>
            {PRESET_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                className={`swatch swatch--icon${values.icon === ic ? ' is-selected' : ''}`}
                onClick={() => set('icon', ic)}
                aria-label={t('form.iconAria', { icon: ic })}
                aria-pressed={values.icon === ic}
              >
                {ic}
              </button>
            ))}
          </div>
          {errors.icon && <p id="habit-icon-error" className="field__error">{errorText(errors.icon)}</p>}
        </div>

        <div className="field">
          <label htmlFor="habit-color">{t('form.color')}</label>
          <input
            id="habit-color"
            type="color"
            value={HEX_RE.test(values.color) ? values.color : '#000000'}
            onChange={(e) => set('color', e.target.value.toUpperCase())}
            aria-invalid={Boolean(errors.color)}
            aria-describedby={errors.color ? 'habit-color-error' : undefined}
          />
          <div className="swatches" role="group" aria-label={t('form.colorSuggested')}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${values.color.toUpperCase() === c ? ' is-selected' : ''}`}
                style={{ background: c }}
                onClick={() => set('color', c)}
                aria-label={t('form.colorAria', { color: c })}
                aria-pressed={values.color.toUpperCase() === c}
              />
            ))}
          </div>
          {errors.color && <p id="habit-color-error" className="field__error">{errorText(errors.color)}</p>}
        </div>
      </div>

      <fieldset className="field">
        <legend>{t('form.frequency')}</legend>
        <div className="segmented">
          <label>
            <input type="radio" name="frequency" value="daily" checked={values.type === 'daily'} onChange={() => setType('daily')} />
            {t('form.daily')}
          </label>
          <label>
            <input
              type="radio"
              name="frequency"
              value="weekdays"
              checked={values.type === 'weekdays'}
              onChange={() => setType('weekdays')}
            />
            {t('form.weekdays')}
          </label>
        </div>
        {values.type === 'weekdays' && (
          <div
            className="day-picker"
            role="group"
            aria-label={t('form.days')}
            aria-describedby={errors.days ? 'habit-days-error' : undefined}
          >
            {Array.from({ length: 7 }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`day-picker__day${values.days.includes(i) ? ' is-selected' : ''}`}
                onClick={() => toggleDay(i)}
                aria-pressed={values.days.includes(i)}
                aria-label={weekdayLong(i)}
              >
                {weekdayShort(i)}
              </button>
            ))}
          </div>
        )}
        {errors.days && <p id="habit-days-error" className="field__error">{errorText(errors.days)}</p>}
      </fieldset>

      <div className="field">
        <label htmlFor="habit-goal">{t('form.goal')}</label>
        <input
          id="habit-goal"
          type="number"
          min={1}
          max={Math.max(scheduledCount, 1)}
          value={values.weeklyGoal}
          onChange={(e) => set('weeklyGoal', e.target.value)}
          aria-invalid={Boolean(errors.weeklyGoal)}
          aria-describedby={errors.weeklyGoal ? 'habit-goal-error' : undefined}
        />
        {errors.weeklyGoal && <p id="habit-goal-error" className="field__error">{errorText(errors.weeklyGoal)}</p>}
      </div>

      {submitError && (
        <p className="alert alert--error" role="alert">
          {submitError}
        </p>
      )}

      <div className="actions">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
          {t('form.cancel')}
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? t('form.saving') : isEdit ? t('form.save') : t('form.create')}
        </button>
      </div>
    </form>
  );
}
