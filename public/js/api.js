// Centralized API client - all requests go through here
// Uses httpOnly cookies for auth (no token handling in frontend)

/**
 * Make an API request. Automatically handles 401 by redirecting to login.
 */
export async function api(method, path, body = null) {
  const opts = {
    method,
    headers: {},
    credentials: 'same-origin', // Include cookies
  };

  if (body && method !== 'GET') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, opts);

  if (res.status === 401) {
    // Session expired or invalid
    window.location.hash = '#login';
    throw new Error('Nicht authentifiziert');
  }

  if (res.status === 429) {
    throw new Error('Zu viele Anfragen');
  }

  return res.json();
}

/**
 * POST login credentials. Cookie is set by server.
 */
export async function login(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Login fehlgeschlagen');
  }
  return res.json();
}

/**
 * POST logout. Clears cookie.
 */
export async function logout() {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  window.location.hash = '#login';
  window.location.reload();
}

/**
 * Upload a file via FormData.
 */
export async function uploadFile(path, file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('path', path);
  const res = await fetch('/api/files/upload', {
    method: 'POST',
    credentials: 'same-origin',
    body: fd,
  });
  return res.json();
}

/**
 * Get a download URL (cookies sent automatically by browser).
 */
export function downloadUrl(path) {
  return `/api${path}`;
}
