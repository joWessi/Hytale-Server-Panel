// File browser with delete/rename/mkdir + multi-upload + drag&drop
import { api, uploadFile, downloadUrl } from '../api.js';
import { formatSize, showToast, hasPerm, confirmDialog, promptDialog, escapeHtml, formatTimeAgo } from '../utils.js';

let currentPath = '/';
let cancelDrag = null;

export function renderFiles(container) {
  const canWrite = hasPerm('files.write');
  container.innerHTML = `
    <div class="card p-4">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
        <div id="breadcrumb" class="text-sm font-mono flex flex-wrap items-center gap-1 min-w-0"></div>
        <div class="flex gap-2 flex-shrink-0">
          ${canWrite ? `
            <button id="btn-mkdir" class="btn-secondary px-3 py-2 text-sm">+ Ordner</button>
            <label class="btn-primary px-4 py-2 text-sm cursor-pointer">
              <input type="file" class="hidden" id="file-input" multiple>Upload
            </label>` : ''}
        </div>
      </div>
      <div id="upload-progress" class="hidden mb-3 text-xs"></div>
      <div id="drop-zone" class="rounded-lg ${canWrite ? 'border-2 border-dashed border-transparent' : ''} transition-colors">
        <div id="file-list" class="space-y-1"></div>
      </div>
    </div>`;

  if (canWrite) {
    document.getElementById('file-input').addEventListener('change', (e) => uploadFiles([...e.target.files]));
    document.getElementById('btn-mkdir').addEventListener('click', () => mkdir());

    const dz = document.getElementById('drop-zone');
    const onOver = (e) => { e.preventDefault(); dz.classList.add('border-panel-accent', 'bg-panel-accent/5'); };
    const onLeave = () => dz.classList.remove('border-panel-accent', 'bg-panel-accent/5');
    const onDrop = (e) => {
      e.preventDefault();
      onLeave();
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) uploadFiles(files);
    };
    dz.addEventListener('dragover', onOver);
    dz.addEventListener('dragleave', onLeave);
    dz.addEventListener('drop', onDrop);
    cancelDrag = () => {
      dz.removeEventListener('dragover', onOver);
      dz.removeEventListener('dragleave', onLeave);
      dz.removeEventListener('drop', onDrop);
    };
  }

  loadFiles('/');
  return () => { cancelDrag?.(); cancelDrag = null; };
}

async function uploadFiles(files) {
  if (!files.length) return;
  const progressEl = document.getElementById('upload-progress');
  progressEl.classList.remove('hidden');
  let okCount = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    progressEl.innerHTML = `Upload ${i + 1}/${files.length}: <span class="font-mono">${escapeHtml(f.name)}</span> <span id="up-pct">0%</span>`;
    try {
      const res = await uploadFile(currentPath, f, (pct) => {
        const pe = document.getElementById('up-pct');
        if (pe) pe.textContent = `${pct}%`;
      });
      if (res.success) okCount++;
      else showToast(`${f.name}: ${res.error || 'Fehlgeschlagen'}`, 'error');
    } catch {
      showToast(`${f.name}: Fehler`, 'error');
    }
  }
  progressEl.classList.add('hidden');
  showToast(`${okCount}/${files.length} hochgeladen`);
  document.getElementById('file-input').value = '';
  loadFiles(currentPath);
}

async function mkdir() {
  const name = await promptDialog('Name des neuen Ordners:', '', { ok: 'Erstellen' });
  if (!name) return;
  if (/[\/\\\0]/.test(name)) { showToast('Ungueltiger Name', 'error'); return; }
  const newPath = (currentPath === '/' ? '' : currentPath) + '/' + name;
  try {
    await api('POST', '/files/mkdir', { path: newPath });
    showToast('Ordner erstellt');
    loadFiles(currentPath);
  } catch (e) { showToast(e.message, 'error'); }
}

function buildBreadcrumb(path) {
  const parts = path.split('/').filter(Boolean);
  const links = [{ name: 'root', path: '/' }];
  let acc = '';
  for (const p of parts) {
    acc += '/' + p;
    links.push({ name: p, path: acc });
  }
  return links.map((l, i) => `
    <span ${i < links.length - 1 ? `class="text-panel-accent hover:underline cursor-pointer" data-go="${escapeHtml(l.path)}"` : 'class="text-panel-dim"'}>${escapeHtml(l.name)}</span>
    ${i < links.length - 1 ? '<span class="text-panel-dim">/</span>' : ''}
  `).join('');
}

async function loadFiles(p) {
  currentPath = p;
  const bc = document.getElementById('breadcrumb');
  const listEl = document.getElementById('file-list');
  bc.innerHTML = buildBreadcrumb(p);
  bc.querySelectorAll('[data-go]').forEach(el => {
    el.addEventListener('click', () => loadFiles(el.dataset.go));
  });

  try {
    const d = await api('GET', `/files?path=${encodeURIComponent(p)}`);
    const canWrite = hasPerm('files.write');
    let html = '';

    if (p !== '/') {
      const parent = p.split('/').slice(0, -1).join('/') || '/';
      html += `<div class="flex items-center gap-3 p-2.5 rounded-lg bg-panel-bg hover:bg-panel-border/50 cursor-pointer text-sm" data-dir="${escapeHtml(parent)}">
        <span>&larr;</span><span>..</span>
      </div>`;
    }

    const sorted = (d.files || []).slice().sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const f of sorted) {
      const fp = (p === '/' ? '' : p) + '/' + f.name;
      const icon = f.isDirectory ? '&#128193;' : '&#128196;';
      const iconColor = f.isDirectory ? 'text-amber-400' : 'text-panel-dim';
      const sizeOrCount = f.isDirectory ? '' : `<span class="text-xs text-panel-dim flex-shrink-0 hidden sm:inline">${formatSize(f.size)}</span>`;
      const mtime = f.mtime ? `<span class="text-xs text-panel-dim flex-shrink-0 hidden md:inline">${escapeHtml(formatTimeAgo(f.mtime))}</span>` : '';
      const protectedBadge = f.protected ? '<span class="text-[10px] text-amber-400 ml-1 px-1.5 py-0.5 rounded bg-amber-400/10">geschuetzt</span>' : '';

      const dirClick = f.isDirectory ? `data-dir="${escapeHtml(fp)}"` : '';
      const cls = f.isDirectory ? 'cursor-pointer hover:bg-panel-border/50' : '';
      const actions = canWrite && !f.protected ? `
        <button class="text-xs text-panel-dim hover:text-panel-accent px-2" data-rename="${escapeHtml(fp)}">Umbenennen</button>
        <button class="text-xs text-red-400 hover:text-red-300 px-2" data-delete="${escapeHtml(fp)}" data-name="${escapeHtml(f.name)}" data-isdir="${f.isDirectory}">Loeschen</button>
      ` : '';
      const dl = !f.isDirectory ? `<a href="${downloadUrl(`/files/download?path=${encodeURIComponent(fp)}`)}" class="text-panel-accent hover:underline text-xs flex-shrink-0">Download</a>` : '';

      html += `<div class="flex items-center gap-3 p-2.5 rounded-lg bg-panel-bg text-sm ${cls}" ${dirClick}>
        <span class="${iconColor} flex-shrink-0">${icon}</span>
        <span class="flex-1 truncate">${escapeHtml(f.name)}${protectedBadge}</span>
        ${mtime}
        ${sizeOrCount}
        ${dl}
        ${actions}
      </div>`;
    }

    listEl.innerHTML = html || '<div class="text-panel-dim text-center py-8 text-sm">Leer</div>';

    listEl.querySelectorAll('[data-dir]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('button, a')) return;
        loadFiles(el.dataset.dir);
      });
    });
    listEl.querySelectorAll('[data-rename]').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); renameFile(el.dataset.rename); });
    });
    listEl.querySelectorAll('[data-delete]').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); deleteFile(el.dataset.delete, el.dataset.name, el.dataset.isdir === 'true'); });
    });
  } catch (e) {
    listEl.innerHTML = `<div class="text-red-400 text-center py-8 text-sm">${escapeHtml(e.message)}</div>`;
  }
}

async function renameFile(fp) {
  const oldName = fp.split('/').pop();
  const newName = await promptDialog(`Neuer Name fuer "${oldName}":`, oldName, { ok: 'Umbenennen' });
  if (!newName || newName === oldName) return;
  if (/[\/\\\0]/.test(newName)) { showToast('Ungueltiger Name', 'error'); return; }
  const parent = fp.split('/').slice(0, -1).join('/') || '/';
  const to = (parent === '/' ? '' : parent) + '/' + newName;
  try {
    await api('POST', '/files/rename', { from: fp, to });
    showToast('Umbenannt');
    loadFiles(currentPath);
  } catch (e) { showToast(e.message, 'error'); }
}

async function deleteFile(fp, name, isDir) {
  const ok = await confirmDialog(
    `${isDir ? 'Ordner' : 'Datei'} "${name}" wirklich loeschen?${isDir ? '\n(Inkl. allem Inhalt!)' : ''}`,
    { danger: true, ok: 'Loeschen' }
  );
  if (!ok) return;
  try {
    await api('DELETE', '/files', { path: fp });
    showToast('Geloescht');
    loadFiles(currentPath);
  } catch (e) { showToast(e.message, 'error'); }
}
