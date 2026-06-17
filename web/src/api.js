const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(path.includes('/refresh') || path.includes('/logout') ? { 'X-CSRF-Token': localStorage.getItem('csrf_token') ?? '' } : {}),
    },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail ?? 'Request failed')
  return data
}

