/**
 * NanoFab entry point.
 *
 * Phase 1 (MVP): Layer 1 device puzzle — compact Id–Vg model, slider UI on
 * Canvas 2D, JSON levels, offline PWA shell.
 *
 * See prompts/nf01/ for the phase-1 implementation plan. Implementation is
 * test-driven: physics and engine modules are written against tests in
 * /tests before any UI is attached.
 */

const app = document.getElementById('app');
if (app) {
  app.innerHTML = `
    <main style="margin:auto;text-align:center;padding:2rem">
      <h1>NanoFab</h1>
      <p>A physics-faithful chip-design puzzle. Phase 1 scaffold — see <code>prompts/nf01/</code>.</p>
    </main>`;
}

// PWA: register the service worker in production builds only.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
    // Offline support is progressive enhancement; the game must still run.
  });
}
