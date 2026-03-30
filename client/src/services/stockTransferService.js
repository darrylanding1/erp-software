import api from './api';

export const getStockTransfers = async (params = {}) => {
  const response = await api.get('/api/stock-transfers', { params });
  return response.data;
};

export const createStockTransfer = async (payload) => {
  const response = await api.post('/api/stock-transfers', payload);
  return response.data;
};

export const postStockTransfer = async (id) => {
  const response = await api.post(`/api/stock-transfers/${id}/post`);
  return response.data;
};