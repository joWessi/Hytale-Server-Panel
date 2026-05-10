// Console component with WebSocket live streaming
import { api } from '../api.js';
import { escapeHtml, showToast } from '../utils.js';

let ws = null;
let fallbackInterval = null;

export function renderConsole(container) {
  const canWrite = window.__panelUser?.role === 'admin' || window.__panelUser?.permissions?.includes('console.write');

  container.innerHTML = `
    <div class="card p-4 h-[calc(100vh-8rem)] flex flex-col">
      <div class="flex justify-between items-center mb-3">
        <span class="font-medium text-sm">Server Konsole</span>
        <div class="flex items-center gap-2">
          <div id="ws-status" class="w-2 h-2 rounded-full bg-panel-dim" title="WebSocket"></div>
          <button id="btn-refresh" class="text-panel-dim hover:text-panel-accent text-sm px-2 py-1">Aktualisieren</button>
        </div>
      </div>
      <div id="console-output" class="console-box flex-1 rounded-lg p-3 overflow-y-auto mb-3"></div>
      ${canWrite ? `
        <div class="flex gap-2">
          <input type="text" id="cmd-input" class="flex-1 px-3 py-2.5 text-sm font-mono" placeholder="Befehl eingeben...">
          <button id="btn-send" class="btn-primary px-4 py-2.5 text-sm">Senden</button>
        </div>` : '<div class="text-xs text-panel-dim">Nur Lesen</div>'}
    </div>`;

  const output = document.getElementById('console-output');

  // Try WebSocket first
  connectWebSocket(output);

  // Refresh button
  document.getElementById('btn-refresh').addEventListener('click', () => loadConsoleHTTP(output));

  // Command input
  if (canWrite) {
    const input = document.getElementById('cmd-input');
    const sendBtn = document.getElementById('btn-send');
    const send = () => {
      const cmd = input.value.trim();
      if (!cmd) return;
      if (ws?.readyState === 1) {
        ws.send(JSON.stringify({ type: 'command', data: cmd }));
      } else {
        api('POST', '/console', { command: cmd }).catch(() => showToast('Fehler', 'error'));
      }
      input.value = '';
    };
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  }

  // Cleanup on unmount
  return () => {
    if (ws) { ws.close(); ws = null; }
    if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
  };
}

function connectWebSocket(output) {
  const wsIndicator = document.getElementById('ws-status');
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/ws/console`;

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      if (wsIndicator) wsIndicator.className = 'w-2 h-2 rounded-full status-online';
      if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'history' || msg.type === 'lines') {
          appendLines(output, msg.data);
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      if (wsIndicator) wsIndicator.className = 'w-2 h-2 rounded-full bg-panel-dim';
      ws = null;
      // Fallback to HTTP polling
      startFallbackPolling(output);
    };

    ws.onerror = () => {
      ws?.close();
    };
  } catch {
    startFallbackPolling(output);
  }
}

function startFallbackPolling(output) {
  if (fallbackInterval) return;
  loadConsoleHTTP(output);
  fallbackInterval = setInterval(() => loadConsoleHTTP(output), 3000);
}

async function loadConsoleHTTP(output) {
  try {
    const d = await api('GET', '/console');
    if (d.logs && output) {
      output.innerHTML = d.logs.map(l => `<div class="console-line">${escapeHtml(l)}</div>`).join('');
      output.scrollTop = output.scrollHeight;
    }
  } catch { /* ignore */ }
}

function appendLines(output, lines) {
  if (!output || !lines?.length) return;
  const wasAtBottom = output.scrollTop + output.clientHeight >= output.scrollHeight - 30;
  lines.forEach(line => {
    const div = document.createElement('div');
    div.className = 'console-line';
    div.textContent = line;
    output.appendChild(div);
  });
  // Keep max 500 lines in DOM
  while (output.children.length > 500) output.removeChild(output.firstChild);
  if (wasAtBottom) output.scrollTop = output.scrollHeight;
}
