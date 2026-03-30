import api from './api';

export const getCustomers = async (params = {}) => {
  const response = await api.get('/api/customers', { params });
  return response.data;
};

export const getCustomerById = async (id) => {
  const response = await api.get(`/api/customers/${id}`);
  return response.data;
};

export const createCustomer = async (payload) => {
  const response = await api.post('/api/customers', payload);
  return response.data;
};

export const updateCustomer = async (id, payload) => {
  const response = await api.put(`/api/customers/${id}`, payload);
  return response.data;
};

export const deleteCustomer = async (id) => {
  const response = await api.delete(`/api/customers/${id}`);
  return response.data;
};