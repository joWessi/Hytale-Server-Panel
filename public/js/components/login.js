// Login component
import { login } from '../api.js';

export function renderLogin(container, onSuccess) {
  container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center p-4">
      <div class="card p-8 w-full max-w-md">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-panel-accent mb-1">HYTALE</h1>
          <p class="text-panel-dim text-sm">Server Control Panel</p>
        </div>
        <form id="login-form" class="space-y-4">
          <div>
            <label class="block text-sm text-panel-dim mb-1">Benutzername</label>
            <input type="text" id="login-user" class="w-full px-4 py-3" autocomplete="username" required>
          </div>
          <div>
            <label class="block text-sm text-panel-dim mb-1">Passwort</label>
            <input type="password" id="login-pass" class="w-full px-4 py-3" autocomplete="current-password" required>
          </div>
          <button type="submit" class="btn-primary w-full py-3">Anmelden</button>
        </form>
        <p id="login-error" class="hidden mt-4 text-red-400 text-center text-sm"></p>
        <p class="mt-6 text-center text-xs text-panel-dim" id="login-version"></p>
      </div>
    </div>`;

  fetch('/health').then(r => r.json()).then(d => {
    document.getElementById('login-version').textContent = `Hytale Panel v${d.version}`;
  }).catch(() => {});

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');
    try {
      const data = await login(
        document.getElementById('login-user').value,
        document.getElementById('login-pass').value,
      );
      onSuccess(data);
    } catch (err) {
      errEl.textContent = err.message || 'Verbindungsfehler';
      errEl.classList.remove('hidden');
    }
  });
}
