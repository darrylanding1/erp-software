import axios from 'axios';

const baseURL =
  import.meta.env.VITE_API_URL?.trim() || 'http://localhost:5000';

const api = axios.create({
  baseURL,
});

const readStoredScope = () => {
  try {
    const raw = localStorage.getItem('inventory_active_scope');
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('inventory_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const activeScope = readStoredScope();

  if (activeScope?.company_id) {
    config.headers['x-company-id'] = activeScope.company_id;
  }

  if (activeScope?.branch_id) {
    config.headers['x-branch-id'] = activeScope.branch_id;
  }

  if (activeScope?.business_unit_id) {
    config.headers['x-business-unit-id'] = activeScope.business_unit_id;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('inventory_token');
      localStorage.removeItem('inventory_user');
      localStorage.removeItem('inventory_active_scope');

      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;