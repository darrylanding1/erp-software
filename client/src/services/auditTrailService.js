import api from './api';

export const getAuditTrails = async (params = {}) => {
  const response = await api.get('/api/audit-trails', { params });
  return response.data;
};