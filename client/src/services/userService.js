import api from './api';

export const getUsers = async (params = {}) => {
  const response = await api.get('/api/users', { params });
  return response.data;
};

export const getUsersMeta = async () => {
  const response = await api.get('/api/users/meta');
  return response.data;
};

export const createUser = async (payload) => {
  const response = await api.post('/api/users', payload);
  return response.data;
};

export const updateUser = async (id, payload) => {
  const response = await api.put(`/api/users/${id}`, payload);
  return response.data;
};

export const deleteUser = async (id) => {
  const response = await api.delete(`/api/users/${id}`);
  return response.data;
};