// Thin API client for docs/API-CONTRACT.md.
// - Base URL from VITE_API_URL (default http://localhost:3000)
// - Bearer token from localStorage
// - Errors thrown as ApiError with a readable `message`:
//     4xx            -> the server's { error } text (plain English by contract)
//     5xx            -> fixed friendly copy (server text is never shown)
//     network / CORS -> fixed friendly copy (fetch rejects; no status)
// - Any 401 clears the session and calls the registered handler (→ login)

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');
const TOKEN_KEY = 'gk_token';
const TUTOR_KEY = 'gk_tutor';

const MSG_OFFLINE = "Can't reach the server. Check your internet.";
const MSG_SERVER = 'Server problem. Please try again in a minute.';

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const session = {
  token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  cachedTutor() {
    try { return JSON.parse(localStorage.getItem(TUTOR_KEY) || 'null'); } catch { return null; }
  },
  save(token, tutor) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (tutor) localStorage.setItem(TUTOR_KEY, JSON.stringify(tutor));
    } catch { /* private mode: session lives in memory only */ }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TUTOR_KEY);
    } catch { /* ignore */ }
  },
};

async function request(method, path, body) {
  const headers = { Accept: 'application/json' };
  const token = session.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  let text;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    // Reading the body can fail too if the connection drops mid-response.
    text = res.status === 204 ? '' : await res.text();
  } catch {
    // Offline, DNS, timeout, or a CORS rejection — the browser hides which.
    throw new ApiError(MSG_OFFLINE, 0);
  }

  if (res.status === 204) return null;

  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    session.clear();
    onUnauthorized();
    throw new ApiError('Please log in again.', 401);
  }

  if (res.status >= 500) throw new ApiError(MSG_SERVER, res.status);

  if (!res.ok) {
    const msg = (data && typeof data.error === 'string' && data.error) || fallbackMessage(res.status);
    throw new ApiError(msg, res.status);
  }
  // 2xx that isn't JSON (e.g. VITE_API_URL pointing at a static host that
  // answers index.html) must not look like an empty, successful result.
  if (text && data === null) throw new ApiError(MSG_SERVER, res.status);
  return data;
}

function fallbackMessage(status) {
  if (status === 404) return 'Not found. It may have been removed.';
  if (status === 403) return 'You are not allowed to do this.';
  return `Something went wrong (${status}).`;
}

/**
 * Fire-and-forget request that survives the page navigating away
 * (fetch keepalive). The result is ignored — callers never wait on it.
 */
function sendAndForget(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = session.token();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    fetch(BASE + path, { method, headers, body: JSON.stringify(body ?? {}), keepalive: true })
      .catch(() => { /* best effort */ });
  } catch { /* very old browsers may throw synchronously on keepalive; best effort */ }
}

const enc = encodeURIComponent;

export const api = {
  // auth
  loginGoogle: (idToken) => request('POST', '/api/auth/google', { idToken }),
  loginDev: (name) => request('POST', '/api/auth/dev', { name }),

  // me
  me: () => request('GET', '/api/me'),
  updateMe: (patch) => request('PATCH', '/api/me', patch),

  // students
  students: (all = false) => request('GET', `/api/students${all ? '?active=all' : ''}`),
  createStudent: (s) => request('POST', '/api/students', s),
  updateStudent: (id, patch) => request('PATCH', `/api/students/${enc(id)}`, patch),
  deactivateStudent: (id) => request('DELETE', `/api/students/${enc(id)}`),

  // dues
  dues: (month) => request('GET', `/api/dues${month ? `?month=${enc(month)}` : ''}`),
  uncollected: () => request('GET', '/api/dues/uncollected'),
  pay: (id, mode) => request('POST', `/api/dues/${enc(id)}/pay`, { mode }),
  unpay: (id) => request('POST', `/api/dues/${enc(id)}/unpay`), // also undoes a waive
  waive: (id) => request('POST', `/api/dues/${enc(id)}/waive`),
  remind: (id) => request('POST', `/api/dues/${enc(id)}/remind`, {}),
  /** Log a reminder the app already opened in WhatsApp. Not awaited; result ignored. */
  logReminder: (id, lang) => sendAndForget('POST', `/api/dues/${enc(id)}/remind`, { lang }),

  // admin
  adminStats: () => request('GET', '/api/admin/stats'),
  adminTutors: () => request('GET', '/api/admin/tutors'),
};
