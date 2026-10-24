// The one place that decides where the LMS server is.
//
//   API_BASE   ends with /api      e.g. https://core5.io/api      -> `${API_BASE}/courses`
//   API_ORIGIN has no /api         e.g. https://core5.io          -> sockets, `${API_ORIGIN}/api/...`
//
// Set VITE_BACKEND_URL (ending in /api) at build time to point a build at another server.
const resolveApiBase = () => {
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:5002/api';
  }
  return 'https://core5.io/api';
};

export const API_BASE = resolveApiBase().replace(/\/+$/, '');
export const API_ORIGIN = API_BASE.replace(/\/api$/, '');

// Files the server stores ("/uploads/...", signed and short-lived) live on the server's
// origin, which is not always the page's origin. Full web addresses are returned unchanged.
export const fileLink = (url) => (typeof url === 'string' && url.startsWith('/') ? `${API_ORIGIN}${url}` : url || '');
