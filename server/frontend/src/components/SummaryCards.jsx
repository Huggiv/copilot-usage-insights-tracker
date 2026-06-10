import { formatNumber, formatTokenCompact, formatDurationMs } from '../utils/format';

export default function SummaryCards({ summary }) {
  const cards = [
    { label: 'Total Cost', value: `$${(summary.total_cost_usd || 0).toFixed(4)}` },
    { label: 'Total Token', value: formatTokenCompact(summary.total_tokens) },
    { label: 'Input Tokens', value: formatTokenCompact(summary.total_input_tokens) },
    { label: 'Output Tokens', value: formatTokenCompact(summary.total_output_tokens) },
    { label: 'Cached Tokens', value: formatTokenCompact(summary.total_cached_tokens) },
    { label: 'Duration', value: formatDurationMs(summary.total_duration_ms) },
    { label: 'Users', value: formatNumber(summary.distinct_users) },
    { label: 'Session', value: formatNumber(summary.total_sessions) },
  ];

  return (
    <div className="cards-grid">
      {cards.map((card) => (
        <section className="metric-card" key={card.label}>
          <h3>{card.label}</h3>
          <p>{card.value}</p>
        </section>
      ))}
    </div>
  );
}
