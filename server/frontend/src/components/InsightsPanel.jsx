import { useState, useRef, useCallback } from 'react';

const SVG_W = 720;
const SVG_H = 200;
const PAD = 36;

function toCostUsd(nanoAiu) {
  return (Number(nanoAiu) || 0) / 1e11;
}

function fmt(value, decimals = 2) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(value || 0);
}

function buildSeries(sessions) {
  const buckets = new Map();
  for (const s of sessions || []) {
    const key = (s.started_at || '').slice(0, 10);
    if (key) buckets.set(key, (buckets.get(key) || 0) + toCostUsd(s.total_nano_aiu));
  }
  return [...buckets.entries()]
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function computePoints(series) {
  if (series.length === 0) return [];
  const maxY = Math.max(...series.map((p) => p.cost), 0.000001);
  const minY = Math.min(...series.map((p) => p.cost), 0);
  const xSpan = Math.max(series.length - 1, 1);
  const ySpan = Math.max(maxY - minY, 0.000001);
  return series.map((p, i) => ({
    ...p,
    x: PAD + (i / xSpan) * (SVG_W - 2 * PAD),
    y: SVG_H - PAD - ((p.cost - minY) / ySpan) * (SVG_H - 2 * PAD),
  }));
}

function buildLinePath(pts) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

export function CreditsMeter({ summary, selectedDays }) {
  const dayCount = Number(selectedDays) || 30;
  const creditsTarget = Math.max((100000 * dayCount) / 30, 1);
  const creditsUsed = Number(summary?.total_ai_credits) || 0;
  const meterPct = Math.min((creditsUsed / creditsTarget) * 100, 100);

  return (
    <article className="credits-meter-card">
      <div className="credits-meter-header">
        <span className="credits-meter-title">AI Credits Meter</span>
        <span className="credits-meter-sub">
          Used:&nbsp;<strong>{fmt(creditsUsed, 4)}</strong>&ensp;/&ensp;Target:&nbsp;<strong>{fmt(creditsTarget, 0)}</strong>&ensp;·&ensp;<strong>{meterPct.toFixed(2)}%</strong>
        </span>
      </div>
      <div
        className="meter-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(meterPct)}
      >
        <div className="meter-fill" style={{ width: `${meterPct}%` }} />
      </div>
    </article>
  );
}

export function CostChart({ sessions }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  const series = buildSeries(sessions);
  const pts = computePoints(series);
  const linePath = buildLinePath(pts);

  const handleMouseMove = useCallback(
    (e) => {
      if (!svgRef.current || pts.length === 0) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * SVG_W;
      const nearest = pts.reduce((best, pt) =>
        Math.abs(pt.x - mouseX) < Math.abs(best.x - mouseX) ? pt : best
      );
      setTooltip({
        svgX: nearest.x,
        svgY: nearest.y,
        date: nearest.date,
        cost: nearest.cost,
        pctX: nearest.x / SVG_W,
        pctY: nearest.y / SVG_H,
      });
    },
    [pts]
  );

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  return (
    <article className="insight-card insight-chart-card">
      <h3>Cost Time Series</h3>
      <p className="insight-subtitle">Daily total cost in USD — hover data points for details</p>
      {series.length === 0 ? (
        <p className="insight-empty">No session cost data in the selected period.</p>
      ) : (
        <div className="line-chart-wrap">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="line-chart"
            preserveAspectRatio="none"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <line x1={PAD} y1={SVG_H - PAD} x2={SVG_W - PAD} y2={SVG_H - PAD} className="axis-line" />
            <path d={linePath} className="series-line" />
            {tooltip && (
              <>
                <line
                  x1={tooltip.svgX}
                  y1={PAD}
                  x2={tooltip.svgX}
                  y2={SVG_H - PAD}
                  className="tooltip-rule"
                  strokeDasharray="4 3"
                />
                <circle cx={tooltip.svgX} cy={tooltip.svgY} r={5} className="series-dot" />
              </>
            )}
          </svg>
          {tooltip && (
            <div
              className="chart-tooltip"
              style={{
                left: `calc(${tooltip.pctX * 100}% + ${tooltip.pctX > 0.7 ? '-130px' : '12px'})`,
                top: `calc(${tooltip.pctY * 100}% - 16px)`,
              }}
            >
              <div className="chart-tooltip-date">{tooltip.date}</div>
              <div className="chart-tooltip-cost">${tooltip.cost.toFixed(6)}</div>
            </div>
          )}
          <div className="chart-footer">
            <span>{series[0]?.date}</span>
            <span>{series[series.length - 1]?.date}</span>
          </div>
        </div>
      )}
    </article>
  );
}

export default function InsightsPanel({ sessions }) {
  return (
    <div className="insights-wrap">
      <CostChart sessions={sessions} />
    </div>
  );
}