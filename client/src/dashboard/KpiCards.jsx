import { Link, useInRouterContext } from 'react-router-dom';
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
        <p>Impossible de charger les indicateurs.</p>
        <p className="dv-state__detail">{error.message}</p>
        <button type="button" className="dv-btn" onClick={reload}>
          Réessayer
        </button>
      </div>
    );
  }

  const s = data;
  const best = s.bestStreak;
  return (
    <>
      <div className="dv-kpis">
        <Kpi label="Habitudes actives" value={s.activeHabits} />
        <Kpi
          label="Complétion du jour"
          value={formatRate(s.todayRate)}
          detail={s.todayScheduled > 0 ? `${s.todayCompleted}/${s.todayScheduled} cochées` : 'Rien de prévu aujourd’hui'}
        />
        <Kpi
          label="Meilleure série"
          value={best ? `${best.value} j` : '—'}
          detail={best && best.value > 0 ? best.habitName : 'Aucune série pour l’instant'}
        />
        <Kpi label="Taux sur 30 jours" value={formatRate(s.rate30d)} detail="Toutes habitudes confondues" />
      </div>
      {s.activeHabits === 0 && (
        <p className="dv-note">
          Aucune habitude active. <HomeLink>Créez votre première habitude</HomeLink> pour voir vos statistiques.
        </p>
      )}
    </>
  );
}
