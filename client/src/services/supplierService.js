import api from './api';

export const getSuppliers = async (params = {}) => {
  const response = await api.get('/api/suppliers', { params });
  return response.data;
};

export const getSupplierById = async (id) => {
  const response = await api.get(`/api/suppliers/${id}`);
  return response.data;
};

export const createSupplier = async (payload) => {
  const response = await api.post('/api/suppliers', payload);
  return response.data;
};

export const updateSupplier = async (id, payload) => {
  const response = await api.put(`/api/suppliers/${id}`, payload);
  return response.data;
};

export const deleteSupplier = async (id) => {
  const response = await api.delete(`/api/suppliers/${id}`);
  return response.data;
};