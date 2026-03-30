import api from './api';

export const getMrpMeta = async () => {
  const response = await api.get('/api/mrp/meta');
  return response.data;
};

export const getMrpPolicies = async (params = {}) => {
  const response = await api.get('/api/mrp/policies', { params });
  return response.data;
};

export const saveMrpPolicy = async (payload) => {
  const response = await api.post('/api/mrp/policies', payload);
  return response.data;
};

export const getMrpRecommendations = async (params = {}) => {
  const response = await api.get('/api/mrp/recommendations', { params });
  return response.data;
};

export const createMrpRun = async (payload) => {
  const response = await api.post('/api/mrp/runs', payload);
  return response.data;
};

export const getMrpRuns = async (params = {}) => {
  const response = await api.get('/api/mrp/runs', { params });
  return response.data;
};

export const getMrpRunById = async (id) => {
  const response = await api.get(`/api/mrp/runs/${id}`);
  return response.data;
};