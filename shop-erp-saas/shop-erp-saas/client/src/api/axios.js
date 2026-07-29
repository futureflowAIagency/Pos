import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // active branch (multi-branch shops) — set once the user picks one in the
  // switcher; the server falls back to the business's main branch if absent.
  // A caller can override per-request (e.g. "import into a different branch
  // without switching") by setting this header explicitly on that call.
  const branchId = localStorage.getItem('activeBranchId');
  if (branchId && !config.headers['X-Branch-Id']) config.headers['X-Branch-Id'] = branchId;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
