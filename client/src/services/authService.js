import api from './api';

export const loginUser = async (payload) => {
  const response = await api.post('/api/auth/login', payload);
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get('/api/auth/me');
  return response.data;
};