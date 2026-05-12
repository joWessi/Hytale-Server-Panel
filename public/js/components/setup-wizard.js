// First-time server install wizard (and update flow re-used from settings).
// Streams progress events from the panel's /ws/setup WebSocket.
import { api, logout } from '../api.js';
import { escapeHtml, showToast, hasPerm, copyToClipboard } from '../utils.js';

export function renderSetupWizard(container, opts = {}) {
  const isUpdate = !!opts.isUpdate;
  const canControl = hasPerm('server.control');

  container.innerHTML = `
    <div class="min-h-[80vh] flex items-center justify-center p-4">
      <div class="card p-6 w-full max-w-2xl">
        <h1 class="text-2xl font-bold mb-1">${isUpdate ? 'Server-Update' : 'Server-Installation'}</h1>
        <p class="text-sm text-panel-dim mb-6">
          ${isUpdate
            ? 'Lade die neueste Hytale-Server-Version. Der Server wird vorher gestoppt.'
            : 'Der Hytale-Server muss noch installiert werden. Das Panel lädt die Server-Dateien direkt von Hytale herunter — du brauchst nur deinen Hytale-Account.'}
        </p>

        ${canControl ? `
          <div id="sw-controls" class="space-y-3">
            <div>
              <label class="text-sm text-panel-dim">Patchline</label>
              <select id="sw-patchline" class="w-full mt-1 px-3 py-2.5 text-sm">
                <option value="release">release (stabil)</option>
                <option value="pre-release">pre-release</option>
              </select>
            </div>
            <div class="flex gap-2 flex-wrap">
              <button id="sw-start" class="btn-primary px-5 py-2.5 text-sm">
                ${isUpdate ? 'Update starten' : 'Installation starten'}
              </button>
              ${isUpdate ? '<button id="sw-back" class="btn-secondary px-4 py-2.5 text-sm">Abbrechen</button>' : ''}
              <button id="sw-reauth" class="btn-secondary px-4 py-2.5 text-sm">Credentials zurücksetzen</button>
              <button id="sw-logout" class="btn-secondary px-4 py-2.5 text-sm ml-auto">Abmelden</button>
            </div>
          </div>` : `
          <div class="text-sm text-amber-400">Du hast keine Berechtigung den Server zu installieren. Bitte einen Admin kontaktieren.</div>
          <button id="sw-logout" class="btn-secondary px-4 py-2.5 text-sm mt-4">Abmelden</button>
        `}

        <div id="sw-progress" class="hidden mt-6 space-y-3"></div>
        <div id="sw-oauth" class="hidden mt-4 p-4 rounded-lg bg-panel-bg border border-panel-accent">
          <p class="font-medium text-panel-accent mb-2">Mit Hytale-Account anmelden</p>
          <ol class="text-sm space-y-1 mb-3 list-decimal list-inside text-panel-dim">
            <li>Öffne diese URL im Browser:</li>
          </ol>
          <a id="sw-oauth-url" target="_blank" rel="noopener" class="block bg-panel-card rounded px-3 py-2 font-mono text-xs break-all mb-3 hover:bg-panel-border text-panel-accent"></a>
          <ol start="2" class="text-sm space-y-1 mb-2 list-decimal list-inside text-panel-dim">
            <li>Gib diesen Code ein:</li>
          </ol>
          <div class="flex items-center gap-2">
            <code id="sw-oauth-code" class="bg-panel-card rounded px-4 py-2 font-mono text-xl tracking-widest"></code>
            <button id="sw-oauth-copy" class="btn-secondary px-3 py-2 text-sm">Kopieren</button>
          </div>
          <p class="text-xs text-panel-dim mt-3">Sobald du angemeldet bist, startet der Download automatisch.</p>
        </div>
        <div id="sw-log" class="hidden mt-4 console-box rounded-lg p-3 max-h-80 overflow-y-auto text-xs"></div>
      </div>
    </div>`;

  document.getElementById('sw-logout')?.addEventListener('click', () => logout());
  if (!canControl) return null;

  document.getElementById('sw-start').addEventListener('click', () => start(isUpdate));
  document.getElementById('sw-back')?.addEventListener('click', () => { location.hash = 'settings'; });
  document.getElementById('sw-reauth').addEventListener('click', async () => {
    try { await api('POST', '/setup/auth-clear'); showToast('Credentials gelöscht'); }
    catch (e) { showToast(e.message, 'error'); }
  });
  document.getElementById('sw-oauth-copy').addEventListener('click', () => {
    copyToClipboard(document.getElementById('sw-oauth-code').textContent);
  });

  return null;
}

function start(isUpdate) {
  const patchline = document.getElementById('sw-patchline').value;
  const controls = document.getElementById('sw-controls');
  const progress = document.getElementById('sw-progress');
  const log = document.getElementById('sw-log');

  controls.querySelectorAll('button, select').forEach(el => el.disabled = true);
  progress.classList.remove('hidden');
  log.classList.remove('hidden');
  progress.innerHTML = `
    <div class="flex items-center gap-2 text-sm">
      <div class="spinner w-4 h-4"></div>
      <span id="sw-stage">Verbinde...</span>
    </div>`;

  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const action = isUpdate ? 'update' : 'install';
  const ws = new WebSocket(`${proto}//${location.host}/ws/setup?action=${action}&patchline=${encodeURIComponent(patchline)}`);

  const setStage = (text) => { const el = document.getElementById('sw-stage'); if (el) el.textContent = text; };
  const appendLog = (line) => {
    const div = document.createElement('div');
    div.className = 'console-line';
    div.textContent = line;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  };

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg.type === 'oauth') {
      document.getElementById('sw-oauth').classList.remove('hidden');
      const urlEl = document.getElementById('sw-oauth-url');
      urlEl.textContent = msg.url;
      urlEl.href = msg.url;
      document.getElementById('sw-oauth-code').textContent = msg.code;
      setStage('Warte auf Anmeldung im Browser...');
      return;
    }
    if (msg.type === 'download' && msg.stage === 'start') {
      document.getElementById('sw-oauth').classList.add('hidden');
      setStage('Lade Server-Dateien herunter...');
    }
    if (msg.type === 'download' && msg.stage === 'done') {
      setStage('Download fertig, entpacke...');
    }
    if (msg.type === 'extract' && msg.stage === 'done') {
      setStage('Installation fast fertig...');
    }
    if (msg.type === 'done') {
      setStage(`Fertig — Version ${msg.installedVersion || 'unbekannt'}`);
    }
    if (msg.type === 'error') {
      appendLog(`FEHLER: ${msg.msg}`);
    }
    if (msg.type === 'info' && msg.msg) {
      appendLog(msg.msg);
    }
    if (msg.type === 'finished') {
      if (msg.success) {
        setStage('Installation abgeschlossen — lade Panel neu...');
        setTimeout(() => location.reload(), 2000);
      } else {
        setStage(`Fehlgeschlagen (exit ${msg.exitCode})`);
        controls.querySelectorAll('button, select').forEach(el => el.disabled = false);
      }
    }
  };

  ws.onerror = () => appendLog('WebSocket-Fehler');
  ws.onclose = () => {
    const stage = document.getElementById('sw-stage');
    if (stage && stage.textContent.startsWith('Verbinde')) {
      setStage('Verbindung abgebrochen');
      controls.querySelectorAll('button, select').forEach(el => el.disabled = false);
    }
  };
}
