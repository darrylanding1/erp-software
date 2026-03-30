import api from './api';

export const getDeliveryDashboardSummary = async () => {
  const response = await api.get('/api/deliveries/summary');
  return response.data;
};

export const getDeliveryCandidates = async (params = {}) => {
  const response = await api.get('/api/deliveries/candidates', { params });
  return response.data;
};

export const getSalesDeliveries = async (params = {}) => {
  const response = await api.get('/api/deliveries', { params });
  return response.data;
};

export const createSalesDelivery = async (payload) => {
  const response = await api.post('/api/deliveries', payload);
  return response.data;
};