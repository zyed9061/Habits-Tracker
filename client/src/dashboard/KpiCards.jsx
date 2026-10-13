import { Link, useInRouterContext } from 'react-router-dom';
import { formatRate } from './format.js';
import { describeError, useI18n } from '../i18n/I18nContext.jsx';

// <Link> dans l'application (pas de rechargement) ; <a> hors routeur (tests, rendu isolé).
function HomeLink({ children }) {
  return useInRouterContext() ? <Link to="/">{children}</Link> : <a href="/">{children}</a>;
}

function Kpi({ label, value, detail }) {
  return (
    <div className="dv-kpi">
      <p className="dv-kpi__label">{label}</p>
      <p className="dv-kpi__value">{value}</p>
      <p className="dv-kpi__detail">{detail ?? ' '}</p>
    </div>
  );
}

export default function KpiCards({ state }) {
  const { t } = useI18n();
  const d = t.dashboard;
  const { data, loading, error, reload } = state;

  if (loading && !data) {
    return (
      <div className="dv-kpis" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="dv-kpi" aria-hidden="true">
            <div className="dv-skeleton dv-skeleton--line" style={{ width: '60%' }} />
            <div className="dv-skeleton dv-skeleton--value" />
            <div className="dv-skeleton dv-skeleton--line" style={{ width: '40%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="dv-panel dv-state dv-state--error" role="alert">
        <p>{d.kpiLoadError}</p>
        <p className="dv-state__detail">{describeError(error, t)}</p>
        <button type="button" className="dv-btn" onClick={reload}>
          {d.retry}
        </button>
      </div>
    );
  }

  const s = data;
  const best = s.bestStreak;
  return (
    <>
      <div className="dv-kpis">
        <Kpi label={d.kpiActive} value={s.activeHabits} />
        <Kpi
          label={d.kpiToday}
          value={formatRate(s.todayRate, t)}
          detail={s.todayScheduled > 0 ? d.kpiChecked(s.todayCompleted, s.todayScheduled) : d.kpiNothingToday}
        />
        <Kpi
          label={d.kpiBestStreak}
          value={best ? d.days(best.value) : '—'}
          detail={best && best.value > 0 ? best.habitName : d.kpiNoStreak}
        />
        <Kpi label={d.kpiRate30} value={formatRate(s.rate30d, t)} detail={d.kpiAllHabits} />
      </div>
      {s.activeHabits === 0 && (
        <p className="dv-note">
          {d.noActiveBefore}
          <HomeLink>{d.noActiveLink}</HomeLink>
          {d.noActiveAfter}
        </p>
      )}
    </>
  );
}
