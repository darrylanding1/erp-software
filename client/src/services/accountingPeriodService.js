import api from './api';

export const getAccountingPeriods = async (params = {}) => {
  const response = await api.get('/api/accounting-periods', { params });
  return response.data;
};

export const generateAccountingPeriods = async (payload) => {
  const response = await api.post('/api/accounting-periods/generate', payload);
  return response.data;
};

export const getPostingLockStatus = async (params = {}) => {
  const response = await api.get('/api/accounting-periods/check', { params });
  return response.data;
};

export const validatePostingDate = async (params = {}) => {
  const response = await api.get('/api/accounting-periods/validate', { params });
  return response.data;
};

export const softCloseAccountingPeriod = async (id, payload = {}) => {
  const response = await api.post(`/api/accounting-periods/${id}/soft-close`, payload);
  return response.data;
};

export const hardCloseAccountingPeriod = async (id, payload = {}) => {
  const response = await api.post(`/api/accounting-periods/${id}/hard-close`, payload);
  return response.data;
};

export const reopenAccountingPeriod = async (id, payload = {}) => {
  const response = await api.post(`/api/accounting-periods/${id}/reopen`, payload);
  return response.data;
};