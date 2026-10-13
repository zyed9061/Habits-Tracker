import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { DAILY_DAYS, RANKING_DAYS, WEEKDAY_WEEKS } from './constants.js';
import { useI18n } from '../i18n/index.js';
import { formatLongDate, formatRate, formatShortDate, toPercent, weekdayLong, weekdayShort } from './format.js';

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 12 };
const PCT_TICKS = [0, 25, 50, 75, 100];

function ChartTooltip({ active, payload, title }) {
  const { t } = useI18n();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="dv-tooltip">
      <strong>{title(p)}</strong>
      {p.scheduled ? (
        <span>
          {formatRate(p.rate)} · {t('chart.checked', { count: countLabel(p) })}
        </span>
      ) : (
        <span>{t('chart.noneScheduled')}</span>
      )}
    </div>
  );
}

// Alternative textuelle de chaque graphique : tableau des valeurs, replié par défaut.
function DataTable({ caption, head, rows }) {
  const { t } = useI18n();
  return (
    <details className="dv-table">
      <summary>{t('chart.viewData')}</summary>
      <div className="dv-table__scroll">
        <table>
          <caption>{caption}</caption>
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, ...cells]) => (
              <tr key={key}>
                {cells.map((c, i) =>
                  i === 0 ? (
                    <th key={i} scope="row">
                      {c}
                    </th>
                  ) : (
                    <td key={i}>{c}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const countLabel = (r) => `${r.completed}/${r.scheduled}`;
const countCell = (r) => (r.scheduled ? countLabel(r) : '—');

const pctAxis = (
  <YAxis
    domain={[0, 100]}
    ticks={PCT_TICKS}
    tickFormatter={(v) => `${v}%`}
    tick={AXIS_TICK}
    axisLine={false}
    tickLine={false}
    width={44}
  />
);

const grid = <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />;

export function DailyChart({ data }) {
  const { t } = useI18n();
  const rows = data.map((d) => ({ ...d, pct: toPercent(d.rate) }));
  return (
    <>
      <div className="dv-chart" role="img" aria-label={t('chart.dailyAria', { n: DAILY_DAYS })}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            {grid}
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={AXIS_TICK}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            {pctAxis}
            <Tooltip
              content={<ChartTooltip title={(p) => formatLongDate(p.date)} />}
              cursor={{ stroke: 'var(--text-muted)', strokeWidth: 1, strokeDasharray: '3 3' }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="pct"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption={t('chart.dailyCaption', { n: DAILY_DAYS })}
        head={[t('chart.colDate'), t('chart.colDone'), t('chart.colRate')]}
        rows={rows.map((r) => [r.date, formatLongDate(r.date), countCell(r), formatRate(r.rate)])}
      />
    </>
  );
}

export function WeekdayChart({ data }) {
  const { t } = useI18n();
  const rows = data.map((d) => ({ ...d, pct: toPercent(d.rate), label: weekdayShort(d.weekday) }));
  return (
    <>
      <div className="dv-chart" role="img" aria-label={t('chart.weekdayAria')}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            {grid}
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
            {pctAxis}
            <Tooltip
              content={<ChartTooltip title={(p) => weekdayLong(p.weekday)} />}
              cursor={{ fill: 'var(--border)', fillOpacity: 0.4 }}
              isAnimationActive={false}
            />
            <Bar dataKey="pct" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption={t('chart.weekdayCaption', { n: WEEKDAY_WEEKS })}
        head={[t('chart.colDay'), t('chart.colDone'), t('chart.colRate')]}
        rows={rows.map((r) => [r.weekday, weekdayLong(r.weekday), countCell(r), formatRate(r.rate)])}
      />
    </>
  );
}

function truncate(str, n) {
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

function HabitTick({ x, y, payload, rows }) {
  const row = rows.find((r) => r.key === payload.value);
  if (!row) return null;
  return (
    <text x={x - 6} y={y} dy={4} textAnchor="end" fill="var(--text)" fontSize={13}>
      <title>{row.name}</title>
      {`${row.icon} ${truncate(row.name, 15)}`}
    </text>
  );
}

function RankLabel({ x, y, width, height, index, rows }) {
  const row = rows[index];
  const streak = row.currentStreak > 0 ? ` · 🔥 ${row.currentStreak}` : '';
  return (
    <text x={x + width + 8} y={y + height / 2} dy={4} fill="var(--text)" fontSize={12}>
      {formatRate(row.rate)}
      <tspan fill="var(--text-muted)">{streak}</tspan>
    </text>
  );
}

export function RankingChart({ data }) {
  const { t } = useI18n();
  const rows = data.map((h) => ({ ...h, key: String(h.habitId), pct: toPercent(h.rate) ?? 0 }));
  return (
    <>
      <div className="dv-chart" role="img" aria-label={t('chart.rankingAria', { n: RANKING_DAYS })}>
        <ResponsiveContainer width="100%" height={rows.length * 44 + 16}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 92, bottom: 4, left: 0 }}
            barCategoryGap={10}
          >
            <XAxis type="number" domain={[0, 100]} hide />
            <YAxis
              type="category"
              dataKey="key"
              width={136}
              axisLine={false}
              tickLine={false}
              tick={<HabitTick rows={rows} />}
            />
            <Tooltip
              content={<ChartTooltip title={(p) => `${p.icon} ${p.name}`} />}
              cursor={{ fill: 'var(--border)', fillOpacity: 0.4 }}
              isAnimationActive={false}
            />
            <Bar
              dataKey="pct"
              radius={[0, 4, 4, 0]}
              maxBarSize={22}
              background={{ fill: 'var(--border)', fillOpacity: 0.35, radius: 4 }}
            >
              {rows.map((r) => (
                <Cell key={r.key} fill={r.color} />
              ))}
              <LabelList dataKey="pct" content={<RankLabel rows={rows} />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption={t('chart.rankingCaption', { n: RANKING_DAYS })}
        head={[t('chart.colHabit'), t('chart.colDone'), t('chart.colRate'), t('chart.colStreak')]}
        rows={rows.map((r) => [r.key, `${r.icon} ${r.name}`, countCell(r), formatRate(r.rate), t('kpi.days', { n: r.currentStreak })])}
      />
    </>
  );
}
