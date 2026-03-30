import api from './api';

export const getCategories = async (params = {}) => {
  const response = await api.get('/api/categories', { params });
  return response.data;
};

export const createCategory = async (payload) => {
  const response = await api.post('/api/categories', payload);
  return response.data;
};

export const updateCategory = async (id, payload) => {
  const response = await api.put(`/api/categories/${id}`, payload);
  return response.data;
};

export const deleteCategory = async (id) => {
  const response = await api.delete(`/api/categories/${id}`);
  return response.data;
};