import api from './api';

export const getDashboardData = async () => {
  const response = await api.get('/api/dashboard');
  return response.data;
};