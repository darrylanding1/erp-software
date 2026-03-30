import api from './api';

export const getReturnCandidates = async (params = {}) => {
  const response = await api.get('/api/sales-returns/candidates', { params });
  return response.data;
};

export const getSalesReturns = async (params = {}) => {
  const response = await api.get('/api/sales-returns', { params });
  return response.data;
};

export const createSalesReturn = async (payload) => {
  const response = await api.post('/api/sales-returns', payload);
  return response.data;
};

export const getCreditMemoCandidates = async (params = {}) => {
  const response = await api.get('/api/sales-returns/credit-memo-candidates', { params });
  return response.data;
};

export const getArCreditMemos = async (params = {}) => {
  const response = await api.get('/api/sales-returns/credit-memos', { params });
  return response.data;
};

export const createArCreditMemo = async (payload) => {
  const response = await api.post('/api/sales-returns/credit-memos', payload);
  return response.data;
};