/**
 * Registers the service worker (production builds only) and reports updates.
 *
 * A new version of the app is downloaded in the background by the browser (it re-checks sw.js on every launch, whenever the
 * app comes back to the foreground and hourly). It then WAITS: onUpdateReady(apply) tells the game, which offers an
 * "Update available" button in the menu. apply() makes the new version take over and the page reloads. The running level
 * is saved after every move (saved-game.js), so the reload never loses anything.
 */
export function registerServiceWorker({ onUpdateReady }) {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  const hadController = !!navigator.serviceWorker.controller;   // false on the very first visit: nothing to replace yet
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then((registration) => {
    const announce = () => {
      if (registration.waiting && navigator.serviceWorker.controller) onUpdateReady(() => registration.waiting?.postMessage({ type: 'SKIP_WAITING' }));
    };
    announce();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') announce(); });
    });
    const check = () => registration.update().catch(() => { /* offline: try again later */ });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 60 * 60 * 1000);
  }).catch(() => { /* no service worker (private mode, old browser): the app still runs, just not offline */ });
}
