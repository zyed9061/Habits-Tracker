// Client HTTP typé par API_CONTRACT.md. Chaque fonction renvoie le JSON du
// serveur ou lève une Error portant le message serveur (`error.message`).
// Les erreurs produites côté client portent un `code` ('unreachable' | 'http')
// pour être traduites à l'affichage (voir describeError dans i18n).

const UNREACHABLE = 'Serveur injoignable';

function unreachable(status) {
  const err = new Error(UNREACHABLE);
  err.code = 'unreachable';
  if (status) err.status = status;
  return err;
}

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw unreachable();
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    // Le proxy Vite répond 500 sans corps JSON quand l'API est arrêtée : même
    // message qu'une erreur réseau plutôt qu'un « Erreur 500 » opaque.
    const serverMessage = data?.error?.message;
    if (!serverMessage && res.status >= 500) throw unreachable(res.status);
    const err = new Error(serverMessage || `Erreur ${res.status}`);
    if (!serverMessage) err.code = 'http';
    err.status = res.status;
    throw err;
  }
  return data;
}

function query(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// Habitudes (F1)
export const getHabits = ({ includeArchived = false } = {}) =>
  request(`/habits${query({ includeArchived: includeArchived ? 'true' : undefined })}`);
export const createHabit = (data) => request('/habits', { method: 'POST', body: data });
export const updateHabit = (id, data) => request(`/habits/${id}`, { method: 'PATCH', body: data });
export const archiveHabit = (id) => request(`/habits/${id}/archive`, { method: 'POST' });
export const unarchiveHabit = (id) => request(`/habits/${id}/unarchive`, { method: 'POST' });

// Check-ins (F2)
export const getCheckins = (from, to) => request(`/checkins${query({ from, to })}`);
export const checkIn = (habitId, date) =>
  request(`/habits/${habitId}/checkins/${date}`, { method: 'PUT' });
export const uncheckIn = (habitId, date) =>
  request(`/habits/${habitId}/checkins/${date}`, { method: 'DELETE' });

// Statistiques (F4, F5)
export const getStatsSummary = () => request('/stats/summary');
export const getStatsHeatmap = (year) => request(`/stats/heatmap${query({ year })}`);
export const getStatsDaily = (days = 30) => request(`/stats/daily${query({ days })}`);
export const getStatsWeekday = (weeks = 12) => request(`/stats/weekday${query({ weeks })}`);
export const getStatsRanking = (days = 30) => request(`/stats/ranking${query({ days })}`);
