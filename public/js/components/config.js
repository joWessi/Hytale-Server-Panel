// Config editor: text mode for any allowed text file, structured mode for .json
import { api } from '../api.js';
import { showToast, hasPerm, escapeHtml } from '../utils.js';

let currentFile = '';
let currentContent = '';
let currentManaged = false;
let mode = 'text'; // 'text' | 'struct'

export function renderConfig(container) {
  const canWrite = hasPerm('config.write');
  container.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="card p-4">
        <h3 class="font-medium text-sm mb-3">Dateien</h3>
        <input type="text" id="cfg-filter" class="w-full mb-3 px-3 py-1.5 text-sm" placeholder="Filter...">
        <div id="cfg-files" class="space-y-1 text-sm max-h-[70vh] overflow-y-auto"></div>
      </div>
      <div class="lg:col-span-2 card p-4 flex flex-col">
        <div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <span id="cfg-filename" class="text-sm text-panel-dim font-mono">Datei auswählen</span>
          <div class="flex gap-2 items-center">
            <div id="cfg-mode" class="flex gap-1 text-xs hidden">
              <button data-mode="text" class="px-2 py-0.5 rounded bg-panel-accent/30 text-panel-accent">Text</button>
              <button data-mode="struct" class="px-2 py-0.5 rounded bg-panel-border">Struktur</button>
            </div>
            <span id="cfg-managed" class="hidden text-[10px] text-amber-400 px-2 py-0.5 rounded bg-amber-400/10">Panel-verwaltet (read-only)</span>
            ${canWrite ? '<button id="btn-save-cfg" class="btn-primary px-4 py-1.5 text-sm hidden">Speichern</button>' : ''}
          </div>
        </div>
        <div id="cfg-editor-wrap" class="flex-1 min-h-0"></div>
      </div>
    </div>`;

  loadFiles();

  document.getElementById('cfg-filter').addEventListener('input', applyFilter);

  document.getElementById('cfg-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    if (btn.dataset.mode === mode) return;
    mode = btn.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(b => {
      b.className = b.dataset.mode === mode
        ? 'px-2 py-0.5 rounded bg-panel-accent/30 text-panel-accent'
        : 'px-2 py-0.5 rounded bg-panel-border';
    });
    renderEditor();
  });

  if (canWrite) {
    document.getElementById('btn-save-cfg').addEventListener('click', saveConfig);
  }
  return null;
}

async function loadFiles() {
  try {
    const d = await api('GET', '/config/files');
    renderFileList(d.files || []);
  } catch (e) { showToast(e.message, 'error'); }
}

function renderFileList(files) {
  const el = document.getElementById('cfg-files');
  const filter = document.getElementById('cfg-filter').value.toLowerCase();
  const filtered = filter ? files.filter(f => f.toLowerCase().includes(filter)) : files;

  if (!filtered.length) { el.innerHTML = '<div class="text-panel-dim text-sm">Keine Dateien</div>'; return; }

  const important = new Set(['config.json', 'whitelist.json', 'bans.json', 'permissions.json']);
  const rootFiles = filtered.filter(f => !f.includes('/'));
  const folderMap = {};
  filtered.forEach(f => {
    if (!f.includes('/')) return;
    const folder = f.split('/')[0];
    (folderMap[folder] = folderMap[folder] || []).push(f);
  });

  rootFiles.sort((a, b) => {
    const ai = important.has(a), bi = important.has(b);
    if (ai !== bi) return ai ? -1 : 1;
    return a.localeCompare(b);
  });

  let html = rootFiles.map(f => {
    const star = important.has(f) ? '<span class="text-amber-400 mr-1">*</span>' : '';
    return `<div class="p-2 rounded cursor-pointer hover:bg-panel-border/50 truncate" data-file="${escapeHtml(f)}">${star}${escapeHtml(f)}</div>`;
  }).join('');

  Object.keys(folderMap).sort().forEach(folder => {
    html += `<div class="mt-2">
      <div class="flex items-center gap-1 text-xs text-panel-dim uppercase tracking-wide mb-1 cursor-pointer" data-toggle="${escapeHtml(folder)}">
        <span class="toggle-arrow">&#9654;</span> ${escapeHtml(folder)} (${folderMap[folder].length})
      </div>
      <div class="hidden pl-2 border-l border-panel-border space-y-1" data-folder="${escapeHtml(folder)}">
        ${folderMap[folder].map(f => `<div class="p-1.5 rounded cursor-pointer hover:bg-panel-border/50 truncate" data-file="${escapeHtml(f)}" title="${escapeHtml(f)}">${escapeHtml(f.split('/').pop())}</div>`).join('')}
      </div>
    </div>`;
  });

  el.innerHTML = html;
  el.querySelectorAll('[data-file]').forEach(item => {
    item.addEventListener('click', () => loadFile(item.dataset.file));
  });
  el.querySelectorAll('[data-toggle]').forEach(item => {
    item.addEventListener('click', () => {
      const folder = document.querySelector(`[data-folder="${item.dataset.toggle}"]`);
      const arrow = item.querySelector('.toggle-arrow');
      if (folder) {
        folder.classList.toggle('hidden');
        arrow.innerHTML = folder.classList.contains('hidden') ? '&#9654;' : '&#9660;';
      }
    });
  });
}

function applyFilter() {
  // re-render with cached list — simpler to refetch
  loadFiles();
}

async function loadFile(filename) {
  currentFile = filename;
  try {
    const d = await api('GET', `/config/read?file=${encodeURIComponent(filename)}`);
    currentContent = d.content ?? '';
    currentManaged = !!d.managed;
    document.getElementById('cfg-filename').textContent = filename;
    document.getElementById('cfg-managed').classList.toggle('hidden', !currentManaged);

    const modeWrap = document.getElementById('cfg-mode');
    const isJson = filename.endsWith('.json');
    modeWrap.classList.toggle('hidden', !isJson);
    if (!isJson) mode = 'text';
    renderEditor();

    const saveBtn = document.getElementById('btn-save-cfg');
    if (saveBtn) saveBtn.classList.toggle('hidden', currentManaged);
  } catch (e) { showToast(e.message, 'error'); }
}

function renderEditor() {
  const wrap = document.getElementById('cfg-editor-wrap');
  if (mode === 'struct') {
    let obj;
    try { obj = JSON.parse(currentContent); }
    catch (e) {
      wrap.innerHTML = `<div class="text-red-400 text-sm p-3 bg-red-500/10 rounded">JSON-Fehler: ${escapeHtml(e.message)}<br>Bitte erst im Text-Modus reparieren.</div>`;
      return;
    }
    wrap.innerHTML = '';
    wrap.appendChild(renderStruct(obj, currentManaged));
  } else {
    wrap.innerHTML = `<textarea id="cfg-editor" class="console-box w-full h-full min-h-[60vh] rounded-lg p-3 resize-none" ${currentManaged ? 'disabled' : ''}></textarea>`;
    document.getElementById('cfg-editor').value = currentContent;
  }
}

// Build a structured editor for JSON values. Returns a DOM node.
function renderStruct(value, readOnly, path = '') {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return renderLeaf(value, readOnly);
  }
  if (Array.isArray(value)) {
    const wrap = document.createElement('div');
    wrap.className = 'pl-3 border-l-2 border-panel-border space-y-1';
    wrap.dataset.kind = 'array';
    value.forEach((v, i) => {
      const row = document.createElement('div');
      row.className = 'flex items-start gap-2';
      row.innerHTML = `<span class="text-xs text-panel-dim font-mono pt-2">[${i}]</span>`;
      const child = renderStruct(v, readOnly, `${path}[${i}]`);
      child.classList.add('flex-1', 'min-w-0');
      row.appendChild(child);
      if (!readOnly) {
        const del = document.createElement('button');
        del.className = 'text-xs text-red-400 hover:text-red-300 pt-2';
        del.textContent = '×';
        del.addEventListener('click', () => row.remove());
        row.appendChild(del);
      }
      wrap.appendChild(row);
    });
    if (!readOnly) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn-secondary px-3 py-1 text-xs';
      addBtn.textContent = '+ Eintrag';
      addBtn.addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'flex items-start gap-2';
        row.innerHTML = `<span class="text-xs text-panel-dim font-mono pt-2">[+]</span>`;
        const child = renderLeaf('', false);
        child.classList.add('flex-1', 'min-w-0');
        row.appendChild(child);
        const del = document.createElement('button');
        del.className = 'text-xs text-red-400 hover:text-red-300 pt-2';
        del.textContent = '×';
        del.addEventListener('click', () => row.remove());
        row.appendChild(del);
        wrap.insertBefore(row, addBtn);
      });
      wrap.appendChild(addBtn);
    }
    return wrap;
  }
  // object
  const wrap = document.createElement('div');
  wrap.className = 'pl-3 border-l-2 border-panel-border space-y-2';
  wrap.dataset.kind = 'object';
  Object.entries(value).forEach(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'flex items-start gap-2 flex-wrap sm:flex-nowrap';
    row.dataset.key = k;
    const isObj = v !== null && typeof v === 'object';
    row.innerHTML = `<label class="text-xs text-panel-dim font-mono pt-2 min-w-[120px] flex-shrink-0">${escapeHtml(k)}</label>`;
    const child = renderStruct(v, readOnly, path ? `${path}.${k}` : k);
    if (!isObj) child.classList.add('flex-1', 'min-w-0');
    else child.classList.add('w-full');
    row.appendChild(child);
    wrap.appendChild(row);
  });
  return wrap;
}

function renderLeaf(value, readOnly) {
  const wrap = document.createElement('div');
  wrap.className = 'flex-1 min-w-0';
  let html;
  if (typeof value === 'boolean') {
    html = `<select class="w-full px-2 py-1.5 text-sm" data-type="boolean" ${readOnly ? 'disabled' : ''}>
      <option value="true" ${value ? 'selected' : ''}>true</option>
      <option value="false" ${!value ? 'selected' : ''}>false</option>
    </select>`;
  } else if (typeof value === 'number') {
    html = `<input type="number" step="any" class="w-full px-2 py-1.5 text-sm font-mono" data-type="number" value="${escapeHtml(String(value))}" ${readOnly ? 'disabled' : ''}>`;
  } else if (value === null) {
    html = `<input type="text" class="w-full px-2 py-1.5 text-sm font-mono italic" data-type="null" value="null" disabled>`;
  } else {
    html = `<input type="text" class="w-full px-2 py-1.5 text-sm font-mono" data-type="string" value="${escapeHtml(String(value))}" ${readOnly ? 'disabled' : ''}>`;
  }
  wrap.innerHTML = html;
  return wrap;
}

function collectStruct(node) {
  if (!node.dataset?.kind) {
    const inp = node.querySelector('[data-type]') || node;
    const t = inp.dataset?.type;
    if (t === 'number') { const n = parseFloat(inp.value); return Number.isFinite(n) ? n : 0; }
    if (t === 'boolean') return inp.value === 'true';
    if (t === 'null') return null;
    return inp.value;
  }
  if (node.dataset.kind === 'array') {
    const arr = [];
    for (const child of node.children) {
      if (child.tagName === 'BUTTON') continue;
      const leaf = child.children[1];
      if (leaf) arr.push(collectStruct(leaf));
    }
    return arr;
  }
  if (node.dataset.kind === 'object') {
    const obj = {};
    for (const row of node.children) {
      const key = row.dataset?.key;
      if (key === undefined) continue;
      const child = row.children[1];
      if (child) obj[key] = collectStruct(child);
    }
    return obj;
  }
  return null;
}

async function saveConfig() {
  if (!currentFile || currentManaged) return;
  let content;
  if (mode === 'struct') {
    try {
      const root = document.querySelector('#cfg-editor-wrap > div[data-kind]');
      const obj = collectStruct(root);
      content = JSON.stringify(obj, null, 2);
    } catch (e) {
      showToast('Struktur-Fehler: ' + e.message, 'error');
      return;
    }
  } else {
    content = document.getElementById('cfg-editor').value;
  }
  try {
    await api('POST', '/config/write', { file: currentFile, content });
    currentContent = content;
    showToast('Gespeichert');
  } catch (e) { showToast(e.message, 'error'); }
}
