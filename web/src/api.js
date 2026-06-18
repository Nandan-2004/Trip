export const API = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export const mediaFileUrl = (id) => `${API}/storage/download/${id}`
export async function api(path, { method = 'GET', body, token } = {}) {
  const finalToken = token || localStorage.getItem('access_token');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(finalToken ? { Authorization: `Bearer ${finalToken}` } : {}),
      ...(path.includes('/refresh') || path.includes('/logout') ? { 'X-CSRF-Token': localStorage.getItem('csrf_token') ?? '' } : {}),
    },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail ?? 'Request failed')
  return data
}

