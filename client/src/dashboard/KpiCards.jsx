import { Link, useInRouterContext } from 'react-router-dom';
import { useI18n } from '../i18n/index.js';
import { formatRate } from './format.js';

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
        <p>{t('kpi.loadError')}</p>
        <p className="dv-state__detail">{error.message}</p>
        <button type="button" className="dv-btn" onClick={reload}>
          {t('panel.retry')}
        </button>
      </div>
    );
  }

  const s = data;
  const best = s.bestStreak;
  return (
    <>
      <div className="dv-kpis">
        <Kpi label={t('kpi.active')} value={s.activeHabits} />
        <Kpi
          label={t('kpi.today')}
          value={formatRate(s.todayRate)}
          detail={s.todayScheduled > 0 ? t('kpi.todayDetail', { done: s.todayCompleted, total: s.todayScheduled }) : t('kpi.todayNone')}
        />
        <Kpi
          label={t('kpi.best')}
          value={best ? t('kpi.days', { n: best.value }) : '—'}
          detail={best && best.value > 0 ? best.habitName : t('kpi.noStreak')}
        />
        <Kpi label={t('kpi.rate30')} value={formatRate(s.rate30d)} detail={t('kpi.rate30Detail')} />
      </div>
      {s.activeHabits === 0 && (
        <p className="dv-note">
          {t('kpi.noHabits')} <HomeLink>{t('kpi.createFirst')}</HomeLink> {t('kpi.noHabitsTail')}
        </p>
      )}
    </>
  );
}
