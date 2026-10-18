import { useState } from 'react';
import { useI18n } from '../i18n/index.js';
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
  const { t } = useI18n();
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
        <h1>{t('dash.title')}</h1>
        <p className="dv-page__lead">{t('dash.lead')}</p>
      </header>

      <KpiCards state={summary} />

      <Panel
        className="dv-panel--wide"
        title={
          <span className="dv-year">
            {t('dash.activity', { year })}
            <span className="dv-year__nav">
              <button
                type="button"
                className="dv-icon-btn"
                onClick={() => setYear(year - 1)}
                disabled={year <= MIN_YEAR}
                aria-label={t('dash.prevYear')}
              >
                ‹
              </button>
              <button
                type="button"
                className="dv-icon-btn"
                onClick={() => setYear(year + 1)}
                disabled={year >= thisYear}
                aria-label={t('dash.nextYear')}
              >
                ›
              </button>
            </span>
          </span>
        }
        subtitle={t('dash.activitySubtitle')}
        state={heatmap}
        isEmpty={isHeatmapEmpty}
        emptyText={t('dash.noneInYear', { year })}
        skeleton={<div className="dv-skeleton dv-skeleton--heatmap" aria-hidden="true" />}
      >
        {(data) => <Heatmap year={data.year} days={data.days} />}
      </Panel>

      <div className="dv-grid-2">
        <Panel
          title={t('dash.dailyTitle', { n: DAILY_DAYS })}
          subtitle={t('dash.dailySubtitle')}
          state={daily}
          isEmpty={noneScheduled}
        >
          {(data) => <DailyChart data={data} />}
        </Panel>
        <Panel
          title={t('dash.weekdayTitle')}
          subtitle={t('dash.weekdaySubtitle', { n: WEEKDAY_WEEKS })}
          state={weekday}
          isEmpty={noneScheduled}
        >
          {(data) => <WeekdayChart data={data} />}
        </Panel>
      </div>

      <Panel
        title={t('dash.rankingTitle')}
        subtitle={t('dash.rankingSubtitle', { n: RANKING_DAYS })}
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
