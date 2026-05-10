// Simple hash-based SPA router with cleanup support

const routes = {};
let currentCleanup = null;
let currentRoute = null;

/**
 * Register a route. handler(container) should return a cleanup function or null.
 */
export function route(hash, handler) {
  routes[hash] = handler;
}

/**
 * Navigate to a hash route.
 */
export function navigate(hash) {
  window.location.hash = hash;
}

/**
 * Get the current route hash.
 */
export function currentHash() {
  return window.location.hash.slice(1) || 'dashboard';
}

/**
 * Initialize the router. Call after all routes are registered.
 */
export function initRouter(getContainer) {
  function handleRoute() {
    // Cleanup previous component
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = null;
    }

    const hash = currentHash();
    currentRoute = hash;
    const handler = routes[hash];
    if (!handler) {
      navigate('dashboard');
      return;
    }

    const container = getContainer();
    if (!container) return;
    container.innerHTML = '';
    currentCleanup = handler(container) || null;
  }

  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  return { handleRoute };
}

export function getCurrentRoute() {
  return currentRoute;
}
