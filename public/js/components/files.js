// File browser component
import { api, uploadFile, downloadUrl } from '../api.js';
import { formatSize, showToast } from '../utils.js';

let currentPath = '/';

export function renderFiles(container) {
  container.innerHTML = `
    <div class="card p-4">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
        <div id="cur-path" class="text-sm text-panel-dim font-mono truncate">--</div>
        <label class="btn-primary px-4 py-2 text-sm cursor-pointer flex-shrink-0">
          <input type="file" class="hidden" id="file-input">Upload
        </label>
      </div>
      <div id="file-list" class="space-y-1"></div>
    </div>`;

  document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    showToast('Upload laeuft...');
    try {
      const d = await uploadFile(currentPath, file);
      if (d.success) { showToast('Upload erfolgreich'); loadFiles(currentPath); }
      else showToast('Upload fehlgeschlagen', 'error');
    } catch { showToast('Upload fehlgeschlagen', 'error'); }
    e.target.value = '';
  });

  loadFiles('/');
  return null;
}

async function loadFiles(p) {
  currentPath = p;
  const pathEl = document.getElementById('cur-path');
  const listEl = document.getElementById('file-list');
  if (pathEl) pathEl.textContent = p;

  try {
    const d = await api('GET', `/files?path=${encodeURIComponent(p)}`);
    let html = '';

    if (p !== '/') {
      const parent = p.split('/').slice(0, -1).join('/') || '/';
      html += `<div class="flex items-center gap-3 p-2.5 rounded-lg bg-panel-bg hover:bg-panel-border/50 cursor-pointer text-sm" data-dir="${parent}">..</div>`;
    }

    if (d.files) {
      const sorted = d.files.slice().sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      sorted.forEach(f => {
        const fp = (p === '/' ? '' : p) + '/' + f.name;
        if (f.isDirectory) {
          html += `<div class="flex items-center gap-3 p-2.5 rounded-lg bg-panel-bg hover:bg-panel-border/50 cursor-pointer text-sm" data-dir="${fp}">
            <span class="text-amber-400 flex-shrink-0">&#128193;</span>
            <span class="flex-1 truncate">${f.name}</span>
          </div>`;
        } else {
          html += `<div class="flex items-center gap-3 p-2.5 rounded-lg bg-panel-bg text-sm">
            <span class="text-panel-dim flex-shrink-0">&#128196;</span>
            <span class="flex-1 truncate">${f.name}</span>
            <span class="text-xs text-panel-dim flex-shrink-0">${formatSize(f.size)}</span>
            <a href="${downloadUrl(`/files/download?path=${encodeURIComponent(fp)}`)}" class="text-panel-accent hover:underline text-xs flex-shrink-0">Download</a>
          </div>`;
        }
      });
    }
    listEl.innerHTML = html || '<div class="text-panel-dim text-center py-8 text-sm">Leer</div>';

    // Attach directory click handlers
    listEl.querySelectorAll('[data-dir]').forEach(el => {
      el.addEventListener('click', () => loadFiles(el.dataset.dir));
    });
  } catch { listEl.innerHTML = '<div class="text-panel-dim text-center py-8 text-sm">Fehler beim Laden</div>'; }
}
