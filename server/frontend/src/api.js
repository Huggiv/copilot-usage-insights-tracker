// Default to same-origin so Docker, remote hosts, and localhost all work consistently.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request(path) {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return res.json();
}

export function fetchUsers() {
  return request('/api/v1/users');
}

export function fetchModels(userId) {
  const qs = userId ? `?user_id=${encodeURIComponent(userId)}` : '';
  return request(`/api/v1/models${qs}`);
}

export function fetchSummary(userId, days = 30) {
  const params = new URLSearchParams();
  if (userId) {
    params.set('user_id', userId);
  }
  params.set('days', days);
  const qs = params.toString();
  return request(`/api/v1/summary?${qs}`);
}

export function fetchSessions(userId, days = 30) {
  const params = new URLSearchParams();
  if (userId) {
    params.set('user_id', userId);
  }
  params.set('days', days);
  const qs = params.toString();
  return request(`/api/v1/sessions?${qs}`);
}

export function fetchModelUsage(userId, model, days = 30) {
  const params = new URLSearchParams();
  if (userId) {
    params.set('user_id', userId);
  }
  if (model) {
    params.set('model', model);
  }
  params.set('days', days);
  return request(`/api/v1/model-usage?${params.toString()}`);
}
