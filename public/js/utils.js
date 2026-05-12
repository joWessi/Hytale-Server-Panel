// Shared utilities

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}

export function formatUptime(s) {
  if (!s || s < 0) return '--';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

export function formatTimeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 60) return 'Gerade';
  if (diff < 3600) return `${Math.floor(diff / 60)} Min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} Std`;
  return `${Math.floor(diff / 86400)} Tage`;
}

export function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast(`Kopiert: ${text}`))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast(`Kopiert: ${text}`);
}

export function hasPerm(p) {
  const u = window.__panelUser;
  if (!u) return false;
  if (u.role === 'admin') return true;
  return Array.isArray(u.permissions) && u.permissions.includes(p);
}

// Convert hex color to darker variant for hover state (approx -10% lightness)
export function darkenHex(hex, amount = 0.15) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  r = Math.max(0, Math.round(r * (1 - amount)));
  g = Math.max(0, Math.round(g * (1 - amount)));
  b = Math.max(0, Math.round(b * (1 - amount)));
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Promise-based confirm modal (replaces window.confirm for better styling)
export function confirmDialog(message, opts = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="card p-5 max-w-md w-full">
        <p class="text-sm mb-4 whitespace-pre-line">${escapeHtml(message)}</p>
        <div class="flex justify-end gap-2">
          <button data-no class="btn-secondary px-4 py-2 text-sm">${escapeHtml(opts.cancel || 'Abbrechen')}</button>
          <button data-yes class="${opts.danger ? 'btn-danger' : 'btn-primary'} px-4 py-2 text-sm">${escapeHtml(opts.ok || 'OK')}</button>
        </div>
      </div>`;
    const close = (v) => { overlay.remove(); resolve(v); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    overlay.querySelector('[data-yes]').addEventListener('click', () => close(true));
    overlay.querySelector('[data-no]').addEventListener('click', () => close(false));
    document.body.appendChild(overlay);
    overlay.querySelector('[data-yes]').focus();
  });
}

// Prompt-style dialog returning string or null
export function promptDialog(message, defaultValue = '', opts = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4';
    overlay.innerHTML = `
      <div class="card p-5 max-w-md w-full">
        <p class="text-sm mb-3">${escapeHtml(message)}</p>
        <input type="${opts.type || 'text'}" class="w-full px-3 py-2 text-sm mb-4" placeholder="${escapeHtml(opts.placeholder || '')}" />
        <div class="flex justify-end gap-2">
          <button data-no class="btn-secondary px-4 py-2 text-sm">Abbrechen</button>
          <button data-yes class="btn-primary px-4 py-2 text-sm">${escapeHtml(opts.ok || 'OK')}</button>
        </div>
      </div>`;
    const input = overlay.querySelector('input');
    input.value = defaultValue;
    const close = (v) => { overlay.remove(); resolve(v); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    overlay.querySelector('[data-yes]').addEventListener('click', () => close(input.value));
    overlay.querySelector('[data-no]').addEventListener('click', () => close(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value);
      if (e.key === 'Escape') close(null);
    });
    document.body.appendChild(overlay);
    input.focus();
    input.select();
  });
}

// Minimal SVG line chart for metrics history
export function renderLineChart(container, points, opts = {}) {
  const w = container.clientWidth || 400;
  const h = opts.height || 80;
  const pad = 4;
  if (!points.length) {
    container.innerHTML = '<div class="text-panel-dim text-xs py-4 text-center">Keine Daten</div>';
    return;
  }
  const xs = points.map(p => p.t);
  const ys = points.map(p => p.v);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = opts.min ?? Math.min(...ys);
  const yMax = opts.max ?? Math.max(...ys, opts.min ?? 0);
  const xR = xMax - xMin || 1;
  const yR = (yMax - yMin) || 1;
  const px = (x) => pad + ((x - xMin) / xR) * (w - 2 * pad);
  const py = (y) => h - pad - ((y - yMin) / yR) * (h - 2 * pad);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1].v;
  container.innerHTML = `
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <path d="${d} L ${px(xMax)},${h - pad} L ${px(xMin)},${h - pad} Z" fill="${opts.color || 'var(--accent)'}" opacity="0.15"/>
      <path d="${d}" fill="none" stroke="${opts.color || 'var(--accent)'}" stroke-width="1.5"/>
    </svg>
    <div class="flex justify-between text-[10px] text-panel-dim mt-1">
      <span>${escapeHtml(opts.unit ? `${yMin}${opts.unit}` : `${yMin}`)}</span>
      <span class="font-mono">${escapeHtml(opts.unit ? `${last}${opts.unit}` : `${last}`)}</span>
      <span>${escapeHtml(opts.unit ? `${yMax}${opts.unit}` : `${yMax}`)}</span>
    </div>`;
}
