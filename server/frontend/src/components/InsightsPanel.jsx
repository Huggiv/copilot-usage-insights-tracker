import { useState, useRef, useCallback } from 'react';
import { formatCredits, formatNumber, formatTokenCompact } from '../utils/format';

const SVG_W = 720;
const SVG_H = 200;
const PAD = 36;

function toCostUsd(nanoAiu) {
  return (Number(nanoAiu) || 0) / 1e11;
}

function fmt(value, decimals = 2) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(value || 0);
}

function buildSessionSeries(sessions) {
  const buckets = new Map();
  for (const s of sessions || []) {
    const key = (s.started_at || '').slice(0, 10);
    if (key) buckets.set(key, (buckets.get(key) || 0) + toCostUsd(s.total_nano_aiu));
  }
  return [...buckets.entries()]
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildCostSeries(sessions, modelUsage) {
  if (modelUsage?.length) {
    const buckets = new Map();
    for (const row of modelUsage) {
      if (row.date) {
        buckets.set(row.date, (buckets.get(row.date) || 0) + toCostUsd(row.nano_aiu));
      }
    }
    return [...buckets.entries()]
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  return buildSessionSeries(sessions);
}

function buildModelBars(modelUsage) {
  const grouped = new Map();
  for (const row of modelUsage || []) {
    const model = row.model || 'Unknown';
    const current = grouped.get(model) || {
      model,
      nanoAiu: 0,
      inputTokens: 0,
      outputTokens: 0,
      sessions: 0,
      requests: 0,
    };
    current.nanoAiu += row.nano_aiu || 0;
    current.inputTokens += row.input_tokens || 0;
    current.outputTokens += row.output_tokens || 0;
    current.sessions += row.session_count || 0;
    current.requests += row.request_count || 0;
    grouped.set(model, current);
  }

  return [...grouped.values()]
    .map((row) => ({ ...row, cost: toCostUsd(row.nanoAiu) }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 8);
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

export function CreditsMeter({ summary, selectedDays, selectedPeriod }) {
  const dayCount = Number(selectedDays) || 30;
  const creditsTarget = selectedPeriod === 'current_month'
    ? 100000
    : Math.max((100000 * dayCount) / 30, 1);
  const creditsUsed = Number(summary?.total_ai_credits) || 0;
  const meterPct = Math.min((creditsUsed / creditsTarget) * 100, 100);

  return (
    <article className="credits-meter-card">
      <div className="credits-meter-header">
        <span className="credits-meter-title">AI CREDITS METER for VS CODE Chat</span>
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

export function CostChart({ sessions, modelUsage }) {
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  const series = buildCostSeries(sessions, modelUsage);
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

export function ModelUsageBarChart({ modelUsage }) {
  const [tooltip, setTooltip] = useState(null);
  const bars = buildModelBars(modelUsage);
  const maxCost = Math.max(...bars.map((bar) => bar.cost), 0.000001);

  return (
    <article className="insight-card insight-chart-card">
      <h3>Model-Level Usage</h3>
      <p className="insight-subtitle">Cost by model in USD — hover bars for usage detail</p>
      {bars.length === 0 ? (
        <p className="insight-empty">No model usage data in the selected period.</p>
      ) : (
        <div className="bar-chart-wrap" onMouseLeave={() => setTooltip(null)}>
          <div className="bar-chart-grid">
            {bars.map((bar) => {
              const height = Math.max((bar.cost / maxCost) * 100, 3);
              return (
                <button
                  type="button"
                  className="model-bar-item"
                  key={bar.model}
                  onMouseEnter={() => setTooltip(bar)}
                  onFocus={() => setTooltip(bar)}
                  aria-label={`${bar.model} cost $${bar.cost.toFixed(6)}`}
                >
                  <span className="model-bar-track">
                    <span className="model-bar-fill" style={{ height: `${height}%` }} />
                  </span>
                  <span className="model-bar-label" title={bar.model}>{bar.model}</span>
                </button>
              );
            })}
          </div>
          {tooltip && (
            <div className="bar-tooltip">
              <div className="chart-tooltip-date">{tooltip.model}</div>
              <div className="chart-tooltip-cost">${tooltip.cost.toFixed(6)}</div>
              <div>AI Credits: {formatCredits(tooltip.nanoAiu)}</div>
              <div>Requests: {formatNumber(tooltip.requests)}</div>
              <div>Sessions: {formatNumber(tooltip.sessions)}</div>
              <div>Input: {formatTokenCompact(tooltip.inputTokens)}</div>
              <div>Output: {formatTokenCompact(tooltip.outputTokens)}</div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function InsightsPanel({ sessions, modelUsage }) {
  return (
    <div className="insights-wrap">
      <CostChart sessions={sessions} modelUsage={modelUsage} />
      <ModelUsageBarChart modelUsage={modelUsage} />
    </div>
  );
}