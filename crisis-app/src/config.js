// Central API configuration
// Set VITE_API_URL at build time for cloud deployments (e.g. Render).
// Falls back to localhost:8000 for local development.

const BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`;
const WS_BASE = BASE.replace(/^http/, 'ws');

export const API_URL = BASE;
export const WS_URL = `${WS_BASE}/ws/dashboard`;
