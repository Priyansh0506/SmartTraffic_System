// single place for the backend URL. locally falls back to the flask dev
// server, on Vercel set REACT_APP_API_URL to the Render backend url.
import axios from 'axios';

export const API_BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000, // route/predict calls can take a few seconds, give them room
});

export default api;
