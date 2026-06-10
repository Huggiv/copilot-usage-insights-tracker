import { useEffect, useState } from 'react';
import { fetchModelUsage, fetchModels, fetchSessions, fetchSummary, fetchUsers } from './api';
import SessionsTable from './components/SessionsTable';
import SummaryCards from './components/SummaryCards';
import ModelUsageTable from './components/ModelUsageTable';
import FilterBar from './components/FilterBar';
import InsightsPanel, { CreditsMeter } from './components/InsightsPanel';

const EMPTY_SUMMARY = {
  total_sessions: 0,
  distinct_users: 0,
  total_input_tokens: 0,
  total_output_tokens: 0,
  total_cached_tokens: 0,
  total_tokens: 0,
  total_nano_aiu: 0,
  total_ai_credits: 0,
  total_cost_usd: 0,
  total_duration_ms: 0,
  total_model_turns: 0,
  total_tool_calls: 0,
};

function resolvePeriodToDays(period) {
  if (period === 'all_time') {
    return 0;
  }

  if (period === 'current_month') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dayDiff = Math.floor((today.getTime() - monthStart.getTime()) / 86400000);
    return Math.max(dayDiff, 1);
  }

  const parsed = parseInt(period, 10);
  return Number.isNaN(parsed) ? 30 : parsed;
}

export default function App() {
  const [users, setUsers] = useState([]);
  const [models, setModels] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [sessions, setSessions] = useState([]);
  const [modelUsage, setModelUsage] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedDays, setSelectedDays] = useState('current_month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch((err) => setError(err.message || 'Failed to load users'));
  }, []);

  useEffect(() => {
    setSelectedModel('');
    fetchModels(selectedUser)
      .then(setModels)
      .catch((err) => setError(err.message || 'Failed to load models'));
  }, [selectedUser]);

  useEffect(() => {
    setLoading(true);
    setError('');

    const daysParam = resolvePeriodToDays(selectedDays);
    Promise.all([
      fetchSummary(selectedUser, daysParam),
      fetchSessions(selectedUser, daysParam),
      fetchModelUsage(selectedUser, selectedModel, daysParam),
    ])
      .then(([summaryRes, sessionsRes, modelUsageRes]) => {
        setSummary(summaryRes);
        setSessions(sessionsRes?.items || []);
        setModelUsage(modelUsageRes?.items || []);
      })
      .catch((err) => setError(err.message || 'Failed to load dashboard data'))
      .finally(() => setLoading(false));
  }, [selectedUser, selectedModel, selectedDays]);

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Copilot Usage</p>
          <h1>Copilot Dashboard</h1>
          <p className="hero-tagline">Operational telemetry with cost and usage intelligence</p>
        </div>
      </header>

      {!loading && (
        <FilterBar
          users={users}
          models={models}
          selectedUser={selectedUser}
          selectedModel={selectedModel}
          selectedDays={selectedDays}
          onUserChange={setSelectedUser}
          onModelChange={setSelectedModel}
          onDaysChange={setSelectedDays}
        />
      )}

      {error && <p className="error-banner">{error}</p>}
      {loading ? (
        <p className="loading">Loading dashboard...</p>
      ) : (
        <>
          <section className="surface-section">
            <CreditsMeter
              summary={summary}
              selectedDays={resolvePeriodToDays(selectedDays)}
              selectedPeriod={selectedDays}
            />
          </section>

          <section className="surface-section">
            <SummaryCards summary={summary} />
          </section>

          <section className="surface-section">
            <InsightsPanel sessions={sessions} />
          </section>

          <section className="surface-section">
            <ModelUsageTable modelUsage={modelUsage} />
          </section>

          <section className="surface-section">
            <SessionsTable sessions={sessions} />
          </section>
        </>
      )}
    </main>
  );
}
