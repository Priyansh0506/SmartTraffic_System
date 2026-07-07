// falls back to localhost if the env var isn't set (local dev)
const API_BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5000';

export default API_BASE;