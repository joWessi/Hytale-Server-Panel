// Settings + own password change
import { api, downloadUrl, logout } from '../api.js';
import { showToast, darkenHex } from '../utils.js';

export function renderSettings(container) {
  container.innerHTML = `
    <div class="space-y-4">
      <div class="card p-5">
        <h3 class="font-medium mb-4">Panel</h3>
        <div>
          <label class="text-sm text-panel-dim">Panel Name</label>
          <input type="text" id="s-name" class="w-full mt-1 px-3 py-2.5" maxlength="50">
        </div>
        <label class="flex items-center gap-2 mt-3 cursor-pointer">
          <input type="checkbox" id="s-hide-name" class="w-4 h-4 accent-[var(--accent)]">
          <span class="text-sm text-panel-dim">Name ausblenden</span>
        </label>
      </div>

      <div class="card p-5">
        <h3 class="font-medium mb-4">Farben</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          ${colorPickerHtml('accent', 'Akzent')}
          ${colorPickerHtml('card', 'Karten')}
          ${colorPickerHtml('bg', 'Hintergrund')}
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
            <input type="number" id="s-port" min="1" max="65535" class="w-full mt-1 px-3 py-2.5">
          </div>
        </div>
      </div>

      <div class="card p-5">
        <h3 class="font-medium mb-4">Backups</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="text-sm text-panel-dim">Strategie</label>
            <select id="s-retention" class="w-full mt-1 px-3 py-2.5">
              <option value="fifo">FIFO (max. N)</option>
              <option value="gfs">GFS (7d / 4w / 6m)</option>
            </select>
          </div>
          <div id="s-max-wrap">
            <label class="text-sm text-panel-dim">Max. Backups (FIFO)</label>
            <input type="number" id="s-max" min="1" max="100" class="w-full mt-1 px-3 py-2.5">
          </div>
        </div>
        <p class="text-xs text-panel-dim mt-2">GFS = Grandfather/Father/Son: 7 taegliche + 4 woechentliche + 6 monatliche behalten.</p>
      </div>

      <div class="card p-5">
        <h3 class="font-medium mb-4">Discord Webhook</h3>
        <p id="webhook-status" class="text-sm text-panel-dim mb-3">--</p>
        <button id="btn-test-webhook" class="btn-secondary px-4 py-2 text-sm">Testen</button>
        <p class="text-xs text-panel-dim mt-2">Webhook-URL ueber Umgebungsvariable DISCORD_WEBHOOK in /etc/hytale-panel/env.</p>
      </div>

      <div class="card p-5">
        <h3 class="font-medium mb-4">Session Timeout</h3>
        <div class="flex items-center gap-2">
          <input type="number" id="s-timeout" min="0" max="1440" class="w-20 px-3 py-2 text-center text-sm">
          <span class="text-panel-dim text-sm">Minuten (0 = nie)</span>
        </div>
      </div>

      <div class="card p-5">
        <h3 class="font-medium mb-3">Aktivitaets-Log</h3>
        <p class="text-sm text-panel-dim mb-3">Protokoll aller Benutzeraktionen</p>
        <a href="${downloadUrl('/activity-log/download')}" class="btn-secondary px-4 py-2 text-sm inline-block">Download Log</a>
      </div>

      <button id="btn-save-settings" class="btn-primary w-full py-3 text-sm">Speichern</button>

      <div class="card p-5">
        <h3 class="font-medium mb-4">Eigenes Passwort aendern</h3>
        <form id="pw-form" class="space-y-3">
          <input type="password" id="pw-current" class="w-full px-3 py-2.5 text-sm" placeholder="Aktuelles Passwort" required>
          <input type="password" id="pw-new" class="w-full px-3 py-2.5 text-sm" placeholder="Neues Passwort (min. 8 Zeichen)" minlength="8" required>
          <input type="password" id="pw-new2" class="w-full px-3 py-2.5 text-sm" placeholder="Wiederholen" minlength="8" required>
          <button type="submit" class="btn-warning px-4 py-2 text-sm">Passwort aendern</button>
        </form>
      </div>
    </div>`;

  loadSettings();
  setupColorPickers();

  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('btn-test-webhook').addEventListener('click', testWebhook);
  document.getElementById('s-retention').addEventListener('change', toggleMaxBackups);
  document.getElementById('pw-form').addEventListener('submit', changeOwnPassword);
  return null;
}

function colorPickerHtml(t, label) {
  return `<div>
    <label class="text-sm text-panel-dim">${label}</label>
    <div class="flex gap-2 mt-1">
      <input type="color" id="c-${t}" class="w-10 h-10 rounded cursor-pointer border-0">
      <input type="text" id="c-${t}-hex" class="flex-1 px-2 py-1 font-mono text-sm" maxlength="7">
    </div>
  </div>`;
}

function setupColorPickers() {
  ['accent', 'card', 'bg'].forEach(t => {
    const picker = document.getElementById(`c-${t}`);
    const hex = document.getElementById(`c-${t}-hex`);
    picker.addEventListener('input', () => {
      hex.value = picker.value;
      applyLivePreview(t, picker.value);
    });
    hex.addEventListener('input', () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(hex.value)) {
        picker.value = hex.value;
        applyLivePreview(t, hex.value);
      }
    });
  });
}

function applyLivePreview(t, value) {
  const map = { accent: '--accent', card: '--card', bg: '--bg' };
  document.documentElement.style.setProperty(map[t], value);
  if (t === 'accent') {
    document.documentElement.style.setProperty('--accent-hover', darkenHex(value, 0.15));
  }
}

async function loadSettings() {
  try {
    const d = await api('GET', '/settings');
    document.getElementById('s-name').value = d.panelName || 'Hytale Panel';
    document.getElementById('s-hide-name').checked = !!d.hidePanelName;
    setColor('accent', d.accentColor || '#22c55e');
    setColor('card', d.cardColor || '#1e293b');
    setColor('bg', d.bgColor || '#0f172a');
    document.getElementById('s-addr').value = d.serverAddress || '';
    document.getElementById('s-port').value = d.serverPort || 5520;
    document.getElementById('s-timeout').value = d.sessionTimeout ?? 30;
    document.getElementById('s-retention').value = d.backupRetention || 'fifo';
    document.getElementById('s-max').value = d.maxBackups || 3;
    toggleMaxBackups();
    document.getElementById('webhook-status').textContent = d.discordWebhookConfigured
      ? 'Webhook konfiguriert (via Umgebungsvariable)'
      : 'Kein Webhook konfiguriert';
  } catch { /* ignore */ }
}

function setColor(t, val) {
  document.getElementById(`c-${t}`).value = val;
  document.getElementById(`c-${t}-hex`).value = val;
}

function toggleMaxBackups() {
  const isFifo = document.getElementById('s-retention').value === 'fifo';
  document.getElementById('s-max-wrap').style.opacity = isFifo ? '1' : '0.5';
  document.getElementById('s-max').disabled = !isFifo;
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
      serverPort: parseInt(document.getElementById('s-port').value, 10),
      sessionTimeout: parseInt(document.getElementById('s-timeout').value, 10),
      maxBackups: parseInt(document.getElementById('s-max').value, 10),
      backupRetention: document.getElementById('s-retention').value,
    });
    showToast('Gespeichert');
  } catch (e) { showToast(e.message, 'error'); }
}

async function testWebhook() {
  try { await api('POST', '/settings/test-webhook'); showToast('Test gesendet'); }
  catch (e) { showToast(e.message, 'error'); }
}

async function changeOwnPassword(e) {
  e.preventDefault();
  const cur = document.getElementById('pw-current').value;
  const a = document.getElementById('pw-new').value;
  const b = document.getElementById('pw-new2').value;
  if (a !== b) { showToast('Passwoerter stimmen nicht ueberein', 'error'); return; }
  if (a.length < 8) { showToast('Mindestens 8 Zeichen', 'error'); return; }
  try {
    await api('POST', '/users/me/password', { currentPassword: cur, newPassword: a });
    showToast('Passwort geaendert - du wirst abgemeldet');
    setTimeout(() => logout(), 1200);
  } catch (e) { showToast(e.message, 'error'); }
}
