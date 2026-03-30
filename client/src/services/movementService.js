import api from './api';

export const getMovements = async (params = {}) => {
  const response = await api.get('/api/movements', { params });
  return response.data;
};

export const createMovement = async (payload) => {
  const response = await api.post('/api/movements', payload);
  return response.data;
};

export const getMovementMeta = async () => {
  const response = await api.get('/api/movements/meta');
  return response.data;
};

export const getStockOverview = async (params = {}) => {
  const response = await api.get('/api/movements/stock-overview', { params });
  return response.data;
};

export const getTransfers = async (params = {}) => {
  const response = await api.get('/api/movements/transfers', { params });
  return response.data;
};

export const createTransfer = async (payload) => {
  const response = await api.post('/api/movements/transfers', payload);
  return response.data;
};