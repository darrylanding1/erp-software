import api from './api';

export const getRefundCandidates = async (params = {}) => {
  const response = await api.get('/api/customer-refunds/candidates', { params });
  return response.data;
};

export const getCustomerRefunds = async (params = {}) => {
  const response = await api.get('/api/customer-refunds', { params });
  return response.data;
};

export const createCustomerRefund = async (payload) => {
  const response = await api.post('/api/customer-refunds', payload);
  return response.data;
};