import api from './api';

export const getChartOfAccounts = async (params = {}) => {
  const response = await api.get('/api/accounting/chart-of-accounts', { params });
  return response.data;
};

export const createAccount = async (payload) => {
  const response = await api.post('/api/accounting/chart-of-accounts', payload);
  return response.data;
};

export const updateAccount = async (id, payload) => {
  const response = await api.put(`/api/accounting/chart-of-accounts/${id}`, payload);
  return response.data;
};

export const deleteAccount = async (id) => {
  const response = await api.delete(`/api/accounting/chart-of-accounts/${id}`);
  return response.data;
};

export const getGeneralLedger = async (params = {}) => {
  const response = await api.get('/api/accounting/general-ledger', { params });
  return response.data;
};

export const getTrialBalance = async (params = {}) => {
  const response = await api.get('/api/accounting/trial-balance', { params });
  return response.data;
};