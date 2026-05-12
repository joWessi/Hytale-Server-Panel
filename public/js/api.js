// Centralized API client - cookies handle auth, no token juggling.

export async function api(method, path, body = null) {
  const opts = {
    method,
    headers: {},
    credentials: 'same-origin',
  };

  if (body !== null && body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, opts);

  if (res.status === 401) {
    if (location.hash !== '#login') {
      location.hash = '#login';
      location.reload();
    }
    throw new Error('Nicht authentifiziert');
  }
  if (res.status === 429) throw new Error('Zu viele Anfragen');

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function login(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login fehlgeschlagen');
  return data;
}

export async function logout() {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  location.hash = '#login';
  location.reload();
}

export async function uploadFile(path, file, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('path', path);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload');
    xhr.withCredentials = true;
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      });
    }
    xhr.onload = () => {
      try { resolve(JSON.parse(xhr.responseText || '{}')); }
      catch { reject(new Error('Antwort fehlerhaft')); }
    };
    xhr.onerror = () => reject(new Error('Upload fehlgeschlagen'));
    xhr.send(fd);
  });
}

export function downloadUrl(path) {
  return `/api${path}`;
}
