// Console with WebSocket live streaming + command history
import { api } from '../api.js';
import { escapeHtml, showToast, hasPerm, copyToClipboard } from '../utils.js';

let ws = null;
let fallbackInterval = null;
let reconnectTimer = null;
let reconnectAttempt = 0;

const HISTORY_KEY = 'hytale-console-history';
const MAX_HISTORY = 50;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function pushHistory(cmd) {
  let h = loadHistory();
  h = h.filter(c => c !== cmd);
  h.push(cmd);
  if (h.length > MAX_HISTORY) h = h.slice(-MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
}

export function renderConsole(container) {
  const canWrite = hasPerm('console.write');
  container.innerHTML = `
    <div class="card p-4 h-[calc(100vh-8rem)] flex flex-col">
      <div class="flex justify-between items-center mb-3">
        <span class="font-medium text-sm">Server Konsole</span>
        <div class="flex items-center gap-2">
          <div id="ws-status" class="w-2 h-2 rounded-full bg-panel-dim" title="WebSocket"></div>
          <label class="flex items-center gap-1 text-xs text-panel-dim cursor-pointer">
            <input type="checkbox" id="auto-scroll" checked class="w-3 h-3 accent-[var(--accent)]"> Auto-Scroll
          </label>
          <button id="btn-clear" class="text-panel-dim hover:text-panel-accent text-xs px-2 py-1">Leeren</button>
        </div>
      </div>
      <div id="console-output" class="console-box flex-1 rounded-lg p-3 overflow-y-auto mb-3"></div>
      ${canWrite ? `
        <div class="flex gap-2">
          <input type="text" id="cmd-input" class="flex-1 px-3 py-2.5 text-sm font-mono" placeholder="Befehl eingeben... (Pfeil hoch/runter für Verlauf)" autocomplete="off">
          <button id="btn-send" class="btn-primary px-4 py-2.5 text-sm">Senden</button>
        </div>` : '<div class="text-xs text-panel-dim">Nur Lesen</div>'}
    </div>`;

  const output = document.getElementById('console-output');
  const autoScroll = document.getElementById('auto-scroll');

  document.getElementById('btn-clear').addEventListener('click', () => { output.innerHTML = ''; });

  connectWebSocket(output, autoScroll);

  if (canWrite) {
    const input = document.getElementById('cmd-input');
    const sendBtn = document.getElementById('btn-send');
    let historyIdx = -1;
    let draft = '';

    const send = () => {
      const cmd = input.value.trim();
      if (!cmd) return;
      pushHistory(cmd);
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'command', data: cmd }));
      } else {
        api('POST', '/console', { command: cmd }).catch(e => showToast(e.message, 'error'));
      }
      input.value = '';
      historyIdx = -1;
      draft = '';
    };
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      const h = loadHistory();
      if (e.key === 'Enter') { send(); return; }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!h.length) return;
        if (historyIdx === -1) draft = input.value;
        historyIdx = Math.min(h.length - 1, historyIdx + 1);
        input.value = h[h.length - 1 - historyIdx];
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIdx <= 0) { historyIdx = -1; input.value = draft; return; }
        historyIdx--;
        input.value = h[h.length - 1 - historyIdx];
      }
    });
  }

  return () => {
    clearTimeout(reconnectTimer); reconnectTimer = null;
    reconnectAttempt = 0;
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
  };
}

function connectWebSocket(output, autoScroll) {
  const wsIndicator = document.getElementById('ws-status');
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/console`;

  try {
    ws = new WebSocket(url);
    ws.onopen = () => {
      reconnectAttempt = 0;
      if (wsIndicator) wsIndicator.className = 'w-2 h-2 rounded-full status-online';
      if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'history') {
          output.innerHTML = '';
          appendLines(output, msg.data, autoScroll);
        } else if (msg.type === 'lines') {
          appendLines(output, msg.data, autoScroll);
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      ws = null;
      if (wsIndicator) wsIndicator.className = 'w-2 h-2 rounded-full bg-panel-dim';
      // Try fallback poll + exponential reconnect
      startFallbackPolling(output, autoScroll);
      reconnectAttempt = Math.min(5, reconnectAttempt + 1);
      const delay = Math.min(15000, 1000 * 2 ** reconnectAttempt);
      reconnectTimer = setTimeout(() => connectWebSocket(output, autoScroll), delay);
    };
    ws.onerror = () => { try { ws?.close(); } catch {} };
  } catch {
    startFallbackPolling(output, autoScroll);
  }
}

function startFallbackPolling(output, autoScroll) {
  if (fallbackInterval) return;
  loadConsoleHTTP(output, autoScroll);
  fallbackInterval = setInterval(() => loadConsoleHTTP(output, autoScroll), 3000);
}

async function loadConsoleHTTP(output, autoScroll) {
  try {
    const d = await api('GET', '/console');
    if (d.logs) {
      output.innerHTML = d.logs.map(l => `<div class="console-line">${escapeHtml(l)}</div>`).join('');
      if (autoScroll?.checked !== false) output.scrollTop = output.scrollHeight;
    }
  } catch { /* ignore */ }
}

function appendLines(output, lines, autoScroll) {
  if (!output || !lines?.length) return;
  const wasAtBottom = output.scrollTop + output.clientHeight >= output.scrollHeight - 30;
  const frag = document.createDocumentFragment();
  lines.forEach(line => {
    const div = document.createElement('div');
    div.className = 'console-line';
    div.textContent = line;
    frag.appendChild(div);
    detectDeviceAuth(line);
  });
  output.appendChild(frag);
  while (output.children.length > 500) output.removeChild(output.firstChild);
  if ((autoScroll?.checked !== false) && wasAtBottom) output.scrollTop = output.scrollHeight;
}

// Watch for Hytale's "DEVICE AUTHORIZATION" block in the live log so we can
// surface URL + code as a clickable modal instead of leaving the user to
// scroll a wall of ANSI-coloured text. Triggered by `auth login device`.
let pendingAuthUrl = null;
function detectDeviceAuth(line) {
  // The richer form has the code embedded in a user_code=… URL
  const m = line.match(/https?:\/\/[^\s]*\?user_code=([A-Za-z0-9_-]+)/);
  if (m) {
    showDeviceAuthModal(m[0], m[1]);
    pendingAuthUrl = null;
    return;
  }
  // Otherwise grab the bare verify URL and wait for the next "Enter code: X" line
  const urlMatch = line.match(/(https?:\/\/[^\s]*\/oauth2\/device\/verify)\b/);
  if (urlMatch && !/user_code=/.test(line)) pendingAuthUrl = urlMatch[1];
  const codeMatch = line.match(/[Ee]nter code[:\s]+([A-Za-z0-9_-]{4,16})/);
  if (codeMatch && pendingAuthUrl) {
    showDeviceAuthModal(`${pendingAuthUrl}?user_code=${codeMatch[1]}`, codeMatch[1]);
    pendingAuthUrl = null;
  }
}

function showDeviceAuthModal(url, code) {
  if (document.getElementById('device-auth-modal')) return; // don't stack
  const overlay = document.createElement('div');
  overlay.id = 'device-auth-modal';
  overlay.className = 'fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4';
  overlay.innerHTML = `
    <div class="card p-6 max-w-lg w-full">
      <h2 class="text-lg font-bold text-panel-accent mb-2">Server-Authentifizierung</h2>
      <p class="text-sm text-panel-dim mb-4">
        Der Hytale-Server möchte sich bei deinem Hytale-Account anmelden. Öffne die URL
        und logge dich ein — der Code ist schon eingebettet, du musst nur bestätigen.
      </p>
      <a id="da-link" href="${escapeHtml(url)}" target="_blank" rel="noopener"
         class="block bg-panel-bg rounded px-3 py-2 font-mono text-xs break-all mb-3 hover:bg-panel-border text-panel-accent">${escapeHtml(url)}</a>
      <div class="flex items-center gap-2 mb-4">
        <span class="text-xs text-panel-dim">Code:</span>
        <code class="bg-panel-bg rounded px-3 py-1.5 font-mono text-lg tracking-widest">${escapeHtml(code)}</code>
        <button id="da-copy" class="btn-secondary px-3 py-1.5 text-xs">Kopieren</button>
      </div>
      <div class="flex justify-end gap-2">
        <button id="da-close" class="btn-secondary px-4 py-2 text-sm">Schließen</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('da-copy').addEventListener('click', () => copyToClipboard(code));
  document.getElementById('da-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
