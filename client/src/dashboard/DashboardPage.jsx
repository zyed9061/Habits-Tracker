import { useState } from 'react';
import './dashboard.css';
import KpiCards from './KpiCards.jsx';
import Panel from './Panel.jsx';
import Heatmap, { isHeatmapEmpty } from './Heatmap.jsx';
import { DailyChart, RankingChart, WeekdayChart } from './Charts.jsx';
import { DAILY_DAYS, RANKING_DAYS, WEEKDAY_WEEKS } from './constants.js';
import { useDaily, useHeatmap, useRanking, useSummary, useWeekday } from './useStats.js';

// Borne basse acceptée par GET /api/stats/heatmap (contrat § 8.3).
const MIN_YEAR = 1970;

const noneScheduled = (rows) => !rows?.some((r) => r.scheduled > 0);

export default function DashboardPage() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);

  const summary = useSummary();
  const heatmap = useHeatmap(year);
  const daily = useDaily(DAILY_DAYS);
  const weekday = useWeekday(WEEKDAY_WEEKS);
  const ranking = useRanking(RANKING_DAYS);

  return (
    <div className="dv-page">
      <header className="dv-page__head">
        <h1>Tableau de bord</h1>
        <p className="dv-page__lead">Vos habitudes en chiffres.</p>
      </header>

      <KpiCards state={summary} />

      <Panel
        className="dv-panel--wide"
        title={
          <span className="dv-year">
            Activité {year}
            <span className="dv-year__nav">
              <button
                type="button"
                className="dv-icon-btn"
                onClick={() => setYear(year - 1)}
                disabled={year <= MIN_YEAR}
                aria-label="Année précédente"
              >
                ‹
              </button>
              <button
                type="button"
                className="dv-icon-btn"
                onClick={() => setYear(year + 1)}
                disabled={year >= thisYear}
                aria-label="Année suivante"
              >
                ›
              </button>
            </span>
          </span>
        }
        subtitle="Part des habitudes prévues cochées, jour par jour"
        state={heatmap}
        isEmpty={isHeatmapEmpty}
        emptyText={`Aucune habitude prévue en ${year}.`}
        skeleton={<div className="dv-skeleton dv-skeleton--heatmap" aria-hidden="true" />}
      >
        {(data) => <Heatmap year={data.year} days={data.days} />}
      </Panel>

      <div className="dv-grid-2">
        <Panel
          title={`Complétion sur ${DAILY_DAYS} jours`}
          subtitle="Taux quotidien, toutes habitudes"
          state={daily}
          isEmpty={noneScheduled}
        >
          {(data) => <DailyChart data={data} />}
        </Panel>
        <Panel
          title="Par jour de la semaine"
          subtitle={`Taux moyen sur les ${WEEKDAY_WEEKS} dernières semaines`}
          state={weekday}
          isEmpty={noneScheduled}
        >
          {(data) => <WeekdayChart data={data} />}
        </Panel>
      </div>

      <Panel
        title="Classement des habitudes"
        subtitle={`Régularité sur ${RANKING_DAYS} jours · 🔥 série en cours`}
        state={ranking}
        isEmpty={(rows) => !rows?.length}
        skeleton={
          <div className="dv-skeleton-list" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="dv-skeleton dv-skeleton--bar" />
            ))}
          </div>
        }
      >
        {(data) => <RankingChart data={data} />}
      </Panel>
    </div>
  );
}
