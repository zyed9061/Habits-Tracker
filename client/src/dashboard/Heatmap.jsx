import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.js';
import { formatLongDate, formatRate, monthShort, mondayIndex, toDateString, weekdayShort } from './format.js';

// Niveau d'intensité 0..4 selon le taux du jour ; 'none' = aucune habitude prévue ce jour-là.
function levelOf(day) {
  if (!day) return 'future';
  if (!day.scheduled) return 'none';
  const r = day.rate ?? 0;
  if (r === 0) return 0;
  if (r < 0.34) return 1;
  if (r < 0.67) return 2;
  if (r < 1) return 3;
  return 4;
}

function buildGrid(year, days) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = new Date(year, 0, 1);
  const offset = mondayIndex(first);
  const cells = [];
  const months = [];
  for (let d = new Date(first), i = 0; d.getFullYear() === year; d.setDate(d.getDate() + 1), i++) {
    const date = toDateString(d);
    const col = Math.floor((offset + i) / 7);
    if (d.getDate() === 1) months.push({ month: d.getMonth(), col });
    cells.push({ date, row: mondayIndex(d), col, day: byDate.get(date) ?? null });
  }
  const weeks = cells[cells.length - 1].col + 1;
  return { cells, months, weeks };
}

function cellLabel(cell, t) {
  const date = formatLongDate(cell.date);
  const d = cell.day;
  if (!d) return `${date} : ${t('heat.notYet')}`;
  if (!d.scheduled) return `${date} : ${t('heat.noneScheduled')}`;
  return `${date} : ${t('heat.cellLabel', { done: d.completed, total: d.scheduled, rate: formatRate(d.rate) })}`;
}

const KEY_STEPS = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };

export default function Heatmap({ year, days }) {
  const { t } = useI18n();
  const { cells, months, weeks } = useMemo(() => buildGrid(year, days), [year, days]);
  // Dernier jour connu (aujourd'hui pour l'année en cours) : point d'entrée clavier.
  const lastIdx = useMemo(() => {
    for (let i = cells.length - 1; i >= 0; i--) if (cells[i].day) return i;
    return 0;
  }, [cells]);
  const wrapRef = useRef(null);
  const scrollRef = useRef(null);
  const cellRefs = useRef([]);
  const [tip, setTip] = useState(null);
  const [activeIdx, setActiveIdx] = useState(lastIdx);

  useLayoutEffect(() => {
    setActiveIdx(lastIdx);
    // Sur mobile, on affiche d'abord les semaines les plus récentes.
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [lastIdx, year, days]);

  const showTip = (cell, target) => {
    if (!cell.day) return setTip(null);
    const wrap = wrapRef.current.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2 - wrap.left, 90), wrap.width - 90);
    setTip({ cell, x, y: r.top - wrap.top });
  };

  // Grille ARIA à tabulation unique : les flèches parcourent les jours (haut/bas = jour, gauche/droite = semaine).
  const onKeyDown = (e) => {
    let next;
    if (e.key in KEY_STEPS) next = activeIdx + KEY_STEPS[e.key];
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = lastIdx;
    else if (e.key === 'Escape') return setTip(null);
    else return;
    e.preventDefault();
    next = Math.min(Math.max(next, 0), lastIdx);
    setActiveIdx(next);
    cellRefs.current[next]?.focus();
  };

  const totals = days.reduce((a, d) => ({ c: a.c + d.completed, s: a.s + d.scheduled }), { c: 0, s: 0 });
  const indexed = cells.map((c, i) => ({ ...c, i }));
  const rows = Array.from({ length: 7 }, (_, r) => indexed.filter((c) => c.row === r));

  return (
    <div className="dv-heatmap" ref={wrapRef} onMouseLeave={() => setTip(null)}>
      <div className="dv-heatmap__scroll" ref={scrollRef} onScroll={() => setTip(null)}>
        <div className="dv-heatmap__inner" style={{ '--weeks': weeks }}>
          <div className="dv-heatmap__months" aria-hidden="true">
            {months.map((m) => (
              <span key={m.month} style={{ gridColumnStart: m.col + 1 }}>
                {monthShort(m.month)}
              </span>
            ))}
          </div>
          <div className="dv-heatmap__weekdays" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i}>{i % 2 === 0 ? weekdayShort(i) : ''}</span>
            ))}
          </div>
          <div
            className="dv-heatmap__grid"
            role="grid"
            aria-label={t('heat.gridLabel', {
              year,
              done: totals.c,
              total: totals.s,
              rate: formatRate(totals.s ? totals.c / totals.s : null),
            })}
            onKeyDown={onKeyDown}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setTip(null);
            }}
          >
            {rows.map((row, r) => (
              <div key={r} role="row" className="dv-heatmap__row">
                {row.map((cell) => (
                  <span
                    key={cell.date}
                    ref={(el) => (cellRefs.current[cell.i] = el)}
                    role="gridcell"
                    tabIndex={cell.i === activeIdx ? 0 : -1}
                    aria-label={cellLabel(cell, t)}
                    aria-disabled={cell.day ? undefined : true}
                    className="dv-cell"
                    data-level={levelOf(cell.day)}
                    style={{ gridRow: cell.row + 1, gridColumn: cell.col + 1 }}
                    onMouseEnter={(e) => showTip(cell, e.currentTarget)}
                    onClick={(e) => showTip(cell, e.currentTarget)}
                    onFocus={(e) => {
                      setActiveIdx(cell.i);
                      showTip(cell, e.currentTarget);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dv-heatmap__legend" aria-hidden="true">
        <span className="dv-legend-item">
          <span className="dv-cell" data-level="none" /> {t('heat.notScheduled')}
        </span>
        <span className="dv-legend-scale">
          {t('heat.less')}
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="dv-cell" data-level={l} />
          ))}
          {t('heat.more')}
        </span>
      </div>

      {tip && (
        <div className="dv-tooltip dv-heatmap__tip" style={{ left: tip.x, top: tip.y }} aria-hidden="true">
          <strong>{formatLongDate(tip.cell.date)}</strong>
          {tip.cell.day.scheduled ? (
            <span>
              {t('heat.tipChecked', { done: tip.cell.day.completed, total: tip.cell.day.scheduled, rate: formatRate(tip.cell.day.rate) })}
            </span>
          ) : (
            <span>{tip.cell.day.completed ? t('heat.tipNoneChecked', { n: tip.cell.day.completed }) : t('heat.tipNone')}</span>
          )}
        </div>
      )}
    </div>
  );
}

export const isHeatmapEmpty = (data) => !data?.days?.some((d) => d.scheduled > 0);
