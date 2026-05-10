// Settings component
import { api, downloadUrl } from '../api.js';
import { showToast } from '../utils.js';

export function renderSettings(container) {
  container.innerHTML = `
    <div class="space-y-4">
      <div class="card p-5">
        <h3 class="font-medium mb-4">Panel</h3>
        <div>
          <label class="text-sm text-panel-dim">Panel Name</label>
          <input type="text" id="s-name" class="w-full mt-1 px-3 py-2.5">
        </div>
        <label class="flex items-center gap-2 mt-3 cursor-pointer">
          <input type="checkbox" id="s-hide-name" class="w-4 h-4 accent-[var(--accent)]">
          <span class="text-sm text-panel-dim">Name ausblenden</span>
        </label>
      </div>
      <div class="card p-5">
        <h3 class="font-medium mb-4">Farben</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label class="text-sm text-panel-dim">Akzent</label>
            <div class="flex gap-2 mt-1">
              <input type="color" id="c-accent" class="w-10 h-10 rounded cursor-pointer border-0">
              <input type="text" id="c-accent-hex" class="flex-1 px-2 py-1 font-mono text-sm">
            </div>
          </div>
          <div>
            <label class="text-sm text-panel-dim">Karten</label>
            <div class="flex gap-2 mt-1">
              <input type="color" id="c-card" class="w-10 h-10 rounded cursor-pointer border-0">
              <input type="text" id="c-card-hex" class="flex-1 px-2 py-1 font-mono text-sm">
            </div>
          </div>
          <div>
            <label class="text-sm text-panel-dim">Hintergrund</label>
            <div class="flex gap-2 mt-1">
              <input type="color" id="c-bg" class="w-10 h-10 rounded cursor-pointer border-0">
              <input type="text" id="c-bg-hex" class="flex-1 px-2 py-1 font-mono text-sm">
            </div>
          </div>
        </div>
      </div>
      <div class="card p-5">
        <h3 class="font-medium mb-4">Server</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-panel-dim">Adresse</label>
            <input type="text" id="s-addr" class="w-full mt-1 px-3 py-2.5">
          </div>
          <div>
            <label class="text-sm text-panel-dim">Port</label>
            <input type="number" id="s-port" class="w-full mt-1 px-3 py-2.5">
          </div>
        </div>
      </div>
      <div class="card p-5">
        <h3 class="font-medium mb-4">Discord Webhook</h3>
        <p id="webhook-status" class="text-sm text-panel-dim mb-3">--</p>
        <button id="btn-test-webhook" class="btn-secondary px-4 py-2 text-sm">Testen</button>
        <p class="text-xs text-panel-dim mt-2">Webhook-URL wird ueber die Umgebungsvariable DISCORD_WEBHOOK konfiguriert.</p>
      </div>
      <div class="card p-5">
        <h3 class="font-medium mb-4">Server Updates</h3>
        <button id="btn-check-update" class="btn-warning px-4 py-2 text-sm">Auf Updates pruefen</button>
      </div>
      <div class="card p-5">
        <h3 class="font-medium mb-4">Session Timeout</h3>
        <div class="flex items-center gap-2">
          <input type="number" id="s-timeout" class="w-20 px-3 py-2 text-center text-sm">
          <span class="text-panel-dim text-sm">Minuten</span>
        </div>
      </div>
      <div class="card p-5">
        <h3 class="font-medium mb-3">Aktivitaets-Log</h3>
        <p class="text-sm text-panel-dim mb-3">Protokoll aller Benutzeraktionen</p>
        <a href="${downloadUrl('/activity-log/download')}" class="btn-secondary px-4 py-2 text-sm inline-block">Download Log</a>
      </div>
      <button id="btn-save-settings" class="btn-primary w-full py-3 text-sm">Speichern</button>
    </div>`;

  loadSettings();
  setupColorPickers();

  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('btn-test-webhook').addEventListener('click', testWebhook);
  document.getElementById('btn-check-update').addEventListener('click', checkUpdate);
  return null;
}

function setupColorPickers() {
  ['accent', 'card', 'bg'].forEach(t => {
    const picker = document.getElementById(`c-${t}`);
    const hex = document.getElementById(`c-${t}-hex`);
    picker.addEventListener('input', () => { hex.value = picker.value; });
    hex.addEventListener('input', () => { if (/^#[0-9A-Fa-f]{6}$/.test(hex.value)) picker.value = hex.value; });
  });
}

async function loadSettings() {
  try {
    const d = await api('GET', '/settings');
    document.getElementById('s-name').value = d.panelName || 'Hytale Panel';
    document.getElementById('s-hide-name').checked = d.hidePanelName || false;
    document.getElementById('c-accent').value = d.accentColor || '#22c55e';
    document.getElementById('c-accent-hex').value = d.accentColor || '#22c55e';
    document.getElementById('c-card').value = d.cardColor || '#1e293b';
    document.getElementById('c-card-hex').value = d.cardColor || '#1e293b';
    document.getElementById('c-bg').value = d.bgColor || '#0f172a';
    document.getElementById('c-bg-hex').value = d.bgColor || '#0f172a';
    document.getElementById('s-addr').value = d.serverAddress || '';
    document.getElementById('s-port').value = d.serverPort || 5520;
    document.getElementById('s-timeout').value = d.sessionTimeout || 30;
    document.getElementById('webhook-status').textContent = d.discordWebhookConfigured
      ? 'Webhook konfiguriert (via Umgebungsvariable)'
      : 'Kein Webhook konfiguriert';
  } catch { /* ignore */ }
}

async function saveSettings() {
  try {
    await api('POST', '/settings', {
      panelName: document.getElementById('s-name').value,
      hidePanelName: document.getElementById('s-hide-name').checked,
      accentColor: document.getElementById('c-accent-hex').value,
      cardColor: document.getElementById('c-card-hex').value,
      bgColor: document.getElementById('c-bg-hex').value,
      serverAddress: document.getElementById('s-addr').value,
      serverPort: document.getElementById('s-port').value,
      sessionTimeout: document.getElementById('s-timeout').value,
    });
    showToast('Gespeichert');
  } catch { showToast('Fehler', 'error'); }
}

async function testWebhook() {
  try { await api('POST', '/settings/test-webhook'); showToast('Test gesendet'); }
  catch { showToast('Fehler', 'error'); }
}

async function checkUpdate() {
  showToast('Pruefe auf Updates...');
  try {
    const d = await api('POST', '/update/check');
    if (d.status === 'available') showToast(`Update verfuegbar: ${d.latestVersion}`);
    else if (d.status === 'current') showToast(`Server ist aktuell: ${d.currentVersion}`);
    else showToast(d.message || 'Status unbekannt', 'warning');
  } catch { showToast('Fehler', 'error'); }
}
