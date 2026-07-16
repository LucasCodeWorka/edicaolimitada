const normalizeBaseUrl = (url) => String(url || '').replace(/\/+$/, '');

export function getDashboardApiBaseUrl() {
  return normalizeBaseUrl(import.meta.env.VITE_DASHBOARD_API_URL);
}

export async function loadDashboardData() {
  const baseUrl = getDashboardApiBaseUrl();
  const response = await fetch(`${baseUrl}/api/dashboard-data`);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Falha ao carregar dados do banco: HTTP ${response.status}`);
  }

  const data = await response.json();

  return {
    data,
    source: 'banco'
  };
}

export async function refreshDashboardCache() {
  const baseUrl = getDashboardApiBaseUrl();

  const response = await fetch(`${baseUrl}/api/cache/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      startDate: '2025-07-01',
      endDate: '2025-12-31'
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Falha ao atualizar cache: HTTP ${response.status}`);
  }

  return response.json();
}
