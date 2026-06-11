// Keep API calls same-origin by default. If an explicit API URL points to localhost
// but the dashboard is opened via an IP/hostname, rewrite the host to the current one.
function resolveApiBaseUrl() {
  const raw = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!raw) {
    return '';
  }

  if (typeof window === 'undefined') {
    return raw;
  }

  try {
    const configured = new URL(raw, window.location.origin);
    const isConfiguredLocal = ['localhost', '127.0.0.1', '::1'].includes(configured.hostname);
    const isCurrentLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

    if (isConfiguredLocal && !isCurrentLocal) {
      configured.hostname = window.location.hostname;
      return configured.toString().replace(/\/$/, '');
    }

    return configured.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/$/, '');
  }
}

const API_BASE_URL = resolveApiBaseUrl();

async function request(path) {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return res.json();
}

function appendUserParams(params, userIds) {
  const ids = Array.isArray(userIds) ? userIds : [userIds].filter(Boolean);
  ids.filter(Boolean).forEach((userId) => params.append('user_id', userId));
}

export function fetchUsers() {
  return request('/api/v1/users');
}

export function fetchModels(userIds) {
  const params = new URLSearchParams();
  appendUserParams(params, userIds);
  const qs = params.toString();
  return request(`/api/v1/models${qs ? `?${qs}` : ''}`);
}

export function fetchSummary(userIds, model, days = 30) {
  const params = new URLSearchParams();
  appendUserParams(params, userIds);
  if (model) {
    params.set('model', model);
  }
  params.set('days', days);
  const qs = params.toString();
  return request(`/api/v1/summary?${qs}`);
}

export function fetchSessions(userIds, model, days = 30) {
  const params = new URLSearchParams();
  appendUserParams(params, userIds);
  if (model) {
    params.set('model', model);
  }
  params.set('days', days);
  const qs = params.toString();
  return request(`/api/v1/sessions?${qs}`);
}

export function fetchModelUsage(userIds, model, days = 30) {
  const params = new URLSearchParams();
  appendUserParams(params, userIds);
  if (model) {
    params.set('model', model);
  }
  params.set('days', days);
  return request(`/api/v1/model-usage?${params.toString()}`);
}
