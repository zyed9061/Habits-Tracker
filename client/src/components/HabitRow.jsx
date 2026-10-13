import { WEEKDAY_SHORT, formatLongDate } from '../dates.js';

// Constantes WCAG : linéarisation sRGB, poids de luminance, seuil noir/blanc.
const SRGB_LINEAR_THRESHOLD = 0.03928;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
const LUMA_RED = 0.2126;
const LUMA_GREEN = 0.7152;
const LUMA_BLUE = 0.0722;
const DARK_TEXT_LUMINANCE = 0.179;

// Couleur de la coche lisible sur la couleur de l'habitude (luminance WCAG).
function contrastOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= SRGB_LINEAR_THRESHOLD ? c / SRGB_LINEAR_DIVISOR : ((c + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
  });
  const luminance = LUMA_RED * r + LUMA_GREEN * g + LUMA_BLUE * b;
  return luminance > DARK_TEXT_LUMINANCE ? '#000000' : '#FFFFFF';
}

// Une habitude : identité, séries (F3) et grille des 7 derniers jours (F2).
export default function HabitRow({ habit, days, isChecked, isPending, onToggle, onEdit, onArchive, error }) {
  return (
    <li className="habit-row card" data-testid={`habit-${habit.id}`} style={{ '--habit-color': habit.color, '--habit-on': contrastOn(habit.color) }}>
      <div className="habit-row__info">
        <span className="habit-row__icon" aria-hidden="true">
          {habit.icon}
        </span>
        <div className="habit-row__text">
          <h2 className="habit-row__name">{habit.name}</h2>
          <p className="habit-row__meta">
            <span aria-label={`Série en cours : ${habit.currentStreak}`} data-testid="current-streak">
              🔥 {habit.currentStreak}
            </span>
            <span aria-label={`Meilleure série : ${habit.bestStreak}`} data-testid="best-streak">
              🏆 {habit.bestStreak}
            </span>
            <span className="habit-row__goal">Objectif {habit.weeklyGoal}/sem.</span>
          </p>
        </div>
        <div className="habit-row__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit} aria-label={`Modifier ${habit.name}`}>
            Modifier
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onArchive} aria-label={`Archiver ${habit.name}`}>
            Archiver
          </button>
        </div>
      </div>

      <div className="week-grid" role="group" aria-label={`Semaine de ${habit.name}`}>
        {days.map((day) => {
          const scheduled = habit.frequency.days.includes(day.weekday);
          const checked = isChecked(day.key);
          const pending = isPending(day.key);
          const label = `${habit.name}, ${formatLongDate(day.date)}${day.isToday ? " (aujourd'hui)" : ''}${
            scheduled ? '' : ', non prévu'
          }`;
          return (
            <div className="week-col" key={day.key}>
              <span className={`week-col__label${day.isToday ? ' is-today' : ''}`} aria-hidden="true">
                {WEEKDAY_SHORT[day.weekday]}
                <small>{day.date.getDate()}</small>
              </span>
              <button
                type="button"
                className={[
                  'week-cell',
                  checked && 'is-checked',
                  !scheduled && 'is-unscheduled',
                  day.isToday && 'is-today',
                  pending && 'is-pending',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={checked}
                aria-label={label}
                title={label}
                data-date={day.key}
                data-scheduled={scheduled}
                disabled={pending}
                onClick={() => onToggle(day.key, !checked)}
              >
                {checked ? '✓' : ''}
              </button>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="alert alert--error habit-row__error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
