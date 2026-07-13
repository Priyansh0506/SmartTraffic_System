// single place for the backend URL. locally falls back to the flask dev
// server, on Vercel set REACT_APP_API_URL to the backend URL if it is separate.
import axios from 'axios';

function resolveApiBase() {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  // In local development, the backend runs on 127.0.0.1:5000.
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocalhost ? 'http://127.0.0.1:5000' : window.location.origin;
  }

  return 'http://127.0.0.1:5000';
}

export const API_BASE = resolveApiBase();

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000, // route/predict calls can take a few seconds, give them room
});

export default api;
