// Backend configuration — single source of truth for all Flask API calls.
//
// The backend is optional. When the toggle is OFF the app works in static mode
// using only browser-side providers (Gemini, Perplexity, Pollinations, Veo).
// When ON, requests go to Flask (Claude Code recognition, ElevenLabs voice,
// drawing archive, story arcs, motion plans).
//
// To change the backend URL for your environment, update BACKEND_URL below.

const BACKEND_URL = 'http://localhost:8091';

// Auto-detect same-origin: if the page is served by Flask itself (same
// host:port as BACKEND_URL) use relative /api/... paths so no CORS is needed.
// Any other origin (static server, GitHub Pages, file://) uses the absolute URL.
function detectBase() {
  try {
    const target = new URL(BACKEND_URL);
    const here = new URL(window.location.href);
    const targetPort = target.port || (target.protocol === 'https:' ? '443' : '80');
    const herePort   = here.port   || (here.protocol   === 'https:' ? '443' : '80');
    if (here.protocol === target.protocol &&
        here.hostname === target.hostname &&
        herePort === targetPort) {
      return ''; // same origin — relative /api/... paths, no CORS needed
    }
  } catch {}
  return BACKEND_URL;
}

export const BACKEND_BASE = detectBase();

export function isBackendEnabled() {
  return localStorage.getItem('use_backend') === 'true';
}

// Drop-in fetch wrapper for backend API calls. Prepends BACKEND_BASE so every
// caller writes backendFetch('/api/something', options) rather than a full URL.
// Callers are responsible for checking isBackendEnabled() before calling this.
export function backendFetch(path, options) {
  return fetch(BACKEND_BASE + path, options);
}
