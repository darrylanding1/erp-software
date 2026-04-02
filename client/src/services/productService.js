import api from './api';

export const getProductMeta = async () => {
  const response = await api.get('/api/products/meta');
  return response.data;
};

export const getProducts = async (params = {}) => {
  const response = await api.get('/api/products', { params });
  return response.data;
};

export const createProduct = async (payload) => {
  const response = await api.post('/api/products', payload);
  return response.data;
};

export const updateProduct = async (id, payload) => {
  const response = await api.put(`/api/products/${id}`, payload);
  return response.data;
};

export const deleteProduct = async (id) => {
  const response = await api.delete(`/api/products/${id}`);
  return response.data;
};
