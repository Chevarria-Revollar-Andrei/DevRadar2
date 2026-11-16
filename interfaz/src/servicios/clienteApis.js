// Dirección base del backend. En producción se configura mediante VITE_API_URL.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Centraliza las peticiones HTTP y transforma los errores en mensajes legibles.
async function request(path) {
  const response = await fetch(`${API_URL}${path}`, { credentials: 'include' });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || 'No se pudo obtener información.');
  return result.data;
}

// Métodos que corresponden a los endpoints definidos en el servidor Express.
export const api = {
  github: (q, language = '', sort = 'stars', page = 1) => request(`/github?q=${encodeURIComponent(q)}&language=${encodeURIComponent(language)}&sort=${sort}&page=${page}&limit=24`),
  stackoverflow: (q, page = 1) => request(`/stackoverflow?q=${encodeURIComponent(q)}&page=${page}&limit=30`),
  hackernews: (q = '', page = 1) => request(`/hackernews?q=${encodeURIComponent(q)}&page=${page}&limit=24`),
  wiki: (topic) => request(`/wiki?topic=${encodeURIComponent(topic)}`),
  health: () => request('/health'),
  auth: {
    me: () => fetch(`${API_URL}/auth/me`, { credentials: 'include' }).then(readResponse),
    login: (data) => send('/auth/login', data),
    register: (data) => send('/auth/register', data),
    logout: () => send('/auth/logout', {}),
    githubUrl: `${API_URL}/auth/github`,
    saved: () => request('/auth/saved'),
    save: (item) => send('/auth/saved', item),
    remove: (type, id) => fetch(`${API_URL}/auth/saved/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' }).then(readResponse),
    history: () => request('/auth/history'),
    addHistory: (query) => send('/auth/history', { query })
  }
};


// Peticiones POST que mantienen las cookies de sesión del usuario.
async function send(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return readResponse(response);
}

async function readResponse(response) {
  const result = await response.json();
  if (!response.ok || result.success === false) throw new Error(result.error || 'No se pudo completar la operación.');
  return result;
}
