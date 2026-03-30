import api from './api';

export const getOrganizationMeta = async () => {
  const response = await api.get('/api/organization/meta');
  return response.data;
};