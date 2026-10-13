import { useState } from 'react';
import { describeError, useI18n } from '../i18n/I18nContext.jsx';
import { DEFAULT_LANG, MESSAGES } from '../i18n/messages.js';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const PRESET_COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#64748B'];
const PRESET_ICONS = ['📚', '🏃', '💧', '🧘', '🥗', '💤', '✍️', '🎸'];
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
// Longueur maximale du nom (contrat section 3), en points de code.
const NAME_MAX_LENGTH = 60;
// L'attribut HTML maxLength compte en unités UTF-16 (un emoji en vaut souvent 2) :
// le double de NAME_MAX_LENGTH laisse passer 60 emoji ; au-delà, le message
// d'erreur s'affiche au lieu d'une saisie bloquée sans explication.
const NAME_INPUT_MAX_LENGTH = NAME_MAX_LENGTH * 2;

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
// `t` : textes de la langue courante (messages d'erreur).
export function validateHabit(values, t = MESSAGES[DEFAULT_LANG]) {
  const msg = t.form.errors;
  const errors = {};
  // Nom et icône comptés en points de code, comme le serveur.
  const nameLength = [...values.name.trim()].length;
  if (nameLength < 1) errors.name = msg.nameRequired;
  else if (nameLength > NAME_MAX_LENGTH) errors.name = msg.nameTooLong(NAME_MAX_LENGTH);
  if (!HEX_RE.test(values.color)) errors.color = msg.color;
  const icon = values.icon.trim();
  // Compte en points de code, comme le serveur (un emoji composé reste valide).
  const iconLength = [...icon].length;
  if (iconLength < 1 || iconLength > 8) errors.icon = msg.icon;
  const days = values.type === 'daily' ? ALL_DAYS : values.days;
  if (days.length === 0) errors.days = msg.days;
  const goal = Number(values.weeklyGoal);
  if (!Number.isInteger(goal) || goal < 1 || goal > 7) errors.weeklyGoal = msg.goalRange;
  else if (days.length > 0 && goal > days.length)
    errors.weeklyGoal = msg.goalTooHigh(days.length);
  return errors;
}

export default function HabitForm({ habit, onSubmit, onCancel }) {
  const { t } = useI18n();
  const f = t.form;
  const [values, setValues] = useState(() => initialState(habit));
  // Valeurs validées à la dernière soumission : les messages sont recalculés au
  // rendu pour suivre un changement de langue.
  const [validated, setValidated] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(habit);
  const errors = validated ? validateHabit(validated, t) : {};

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
    const errs = validateHabit(values, t);
    setValidated(values);
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
      setSubmitError(err);
      setSaving(false);
    }
  }

  return (
    <form className="card habit-form" onSubmit={handleSubmit} aria-label={isEdit ? f.editTitle : f.newTitle} noValidate>
      <h2 className="habit-form__title">{isEdit ? f.editTitle : f.newTitle}</h2>

      <div className="field">
        <label htmlFor="habit-name">{f.name}</label>
        <input
          id="habit-name"
          type="text"
          value={values.name}
          maxLength={NAME_INPUT_MAX_LENGTH}
          onChange={(e) => set('name', e.target.value)}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'habit-name-error' : undefined}
          autoFocus
        />
        {errors.name && <p id="habit-name-error" className="field__error">{errors.name}</p>}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="habit-icon">{f.icon}</label>
          <input
            id="habit-icon"
            className="habit-form__icon-input"
            type="text"
            value={values.icon}
            onChange={(e) => set('icon', e.target.value)}
            aria-invalid={Boolean(errors.icon)}
            aria-describedby={errors.icon ? 'habit-icon-error' : undefined}
          />
          <div className="swatches" role="group" aria-label={f.iconSuggestions}>
            {PRESET_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                className={`swatch swatch--icon${values.icon === ic ? ' is-selected' : ''}`}
                onClick={() => set('icon', ic)}
                aria-label={f.iconNamed(ic)}
                aria-pressed={values.icon === ic}
              >
                {ic}
              </button>
            ))}
          </div>
          {errors.icon && <p id="habit-icon-error" className="field__error">{errors.icon}</p>}
        </div>

        <div className="field">
          <label htmlFor="habit-color">{f.color}</label>
          <input
            id="habit-color"
            type="color"
            value={HEX_RE.test(values.color) ? values.color : '#000000'}
            onChange={(e) => set('color', e.target.value.toUpperCase())}
            aria-invalid={Boolean(errors.color)}
            aria-describedby={errors.color ? 'habit-color-error' : undefined}
          />
          <div className="swatches" role="group" aria-label={f.colorSuggestions}>
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${values.color.toUpperCase() === c ? ' is-selected' : ''}`}
                style={{ background: c }}
                onClick={() => set('color', c)}
                aria-label={f.colorNamed(c)}
                aria-pressed={values.color.toUpperCase() === c}
              />
            ))}
          </div>
          {errors.color && <p id="habit-color-error" className="field__error">{errors.color}</p>}
        </div>
      </div>

      <fieldset className="field">
        <legend>{f.frequency}</legend>
        <div className="segmented">
          <label>
            <input type="radio" name="frequency" value="daily" checked={values.type === 'daily'} onChange={() => setType('daily')} />
            {f.daily}
          </label>
          <label>
            <input
              type="radio"
              name="frequency"
              value="weekdays"
              checked={values.type === 'weekdays'}
              onChange={() => setType('weekdays')}
            />
            {f.weekdays}
          </label>
        </div>
        {values.type === 'weekdays' && (
          <div
            className="day-picker"
            role="group"
            aria-label={f.scheduledDays}
            aria-describedby={errors.days ? 'habit-days-error' : undefined}
          >
            {t.weekdaysShort.map((label, i) => (
              <button
                key={i}
                type="button"
                className={`day-picker__day${values.days.includes(i) ? ' is-selected' : ''}`}
                onClick={() => toggleDay(i)}
                aria-pressed={values.days.includes(i)}
                aria-label={t.weekdaysLong[i]}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {errors.days && <p id="habit-days-error" className="field__error">{errors.days}</p>}
      </fieldset>

      <div className="field">
        <label htmlFor="habit-goal">{f.weeklyGoal}</label>
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
        {errors.weeklyGoal && <p id="habit-goal-error" className="field__error">{errors.weeklyGoal}</p>}
      </div>

      {submitError && (
        <p className="alert alert--error" role="alert">
          {describeError(submitError, t)}
        </p>
      )}

      <div className="actions">
        <button type="button" className="btn" onClick={onCancel} disabled={saving}>
          {f.cancel}
        </button>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? f.saving : isEdit ? f.save : f.create}
        </button>
      </div>
    </form>
  );
}
