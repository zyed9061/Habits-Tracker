import { useState } from 'react';
import './dashboard.css';
import KpiCards from './KpiCards.jsx';
import Panel from './Panel.jsx';
import Heatmap, { isHeatmapEmpty } from './Heatmap.jsx';
import { DailyChart, RankingChart, WeekdayChart } from './Charts.jsx';
import { DAILY_DAYS, RANKING_DAYS, WEEKDAY_WEEKS } from './constants.js';
import { useI18n } from '../i18n/I18nContext.jsx';
import { useDaily, useHeatmap, useRanking, useSummary, useWeekday } from './useStats.js';

// Borne basse acceptée par GET /api/stats/heatmap (contrat § 8.3).
const MIN_YEAR = 1970;

const noneScheduled = (rows) => !rows?.some((r) => r.scheduled > 0);

export default function DashboardPage() {
  const { t } = useI18n();
  const d = t.dashboard;
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
        <h1>{d.title}</h1>
        <p className="dv-page__lead">{d.lead}</p>
      </header>

      <KpiCards state={summary} />

      <Panel
        className="dv-panel--wide"
        title={
          <span className="dv-year">
            {d.activity(year)}
            <span className="dv-year__nav">
              <button
                type="button"
                className="dv-icon-btn"
                onClick={() => setYear(year - 1)}
                disabled={year <= MIN_YEAR}
                aria-label={d.prevYear}
              >
                ‹
              </button>
              <button
                type="button"
                className="dv-icon-btn"
                onClick={() => setYear(year + 1)}
                disabled={year >= thisYear}
                aria-label={d.nextYear}
              >
                ›
              </button>
            </span>
          </span>
        }
        subtitle={d.heatmapSubtitle}
        state={heatmap}
        isEmpty={isHeatmapEmpty}
        emptyText={d.noneInYear(year)}
        skeleton={<div className="dv-skeleton dv-skeleton--heatmap" aria-hidden="true" />}
      >
        {(data) => <Heatmap year={data.year} days={data.days} />}
      </Panel>

      <div className="dv-grid-2">
        <Panel
          title={d.dailyTitle(DAILY_DAYS)}
          subtitle={d.dailySubtitle}
          state={daily}
          isEmpty={noneScheduled}
        >
          {(data) => <DailyChart data={data} days={DAILY_DAYS} />}
        </Panel>
        <Panel
          title={d.weekdayTitle}
          subtitle={d.weekdaySubtitle(WEEKDAY_WEEKS)}
          state={weekday}
          isEmpty={noneScheduled}
        >
          {(data) => <WeekdayChart data={data} weeks={WEEKDAY_WEEKS} />}
        </Panel>
      </div>

      <Panel
        title={d.rankingTitle}
        subtitle={d.rankingSubtitle(RANKING_DAYS)}
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
        {(data) => <RankingChart data={data} days={RANKING_DAYS} />}
      </Panel>
    </div>
  );
}
