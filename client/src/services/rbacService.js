import api from './api';

export const getRbacMeta = async () => {
  const response = await api.get('/api/rbac/meta');
  return response.data;
};

export const updateRolePermissions = async (roleId, permission_codes) => {
  const response = await api.put(`/api/rbac/roles/${roleId}/permissions`, {
    permission_codes,
  });
  return response.data;
};

export const getUserOverrides = async (userId) => {
  const response = await api.get(`/api/rbac/users/${userId}/overrides`);
  return response.data;
};

export const saveUserOverrides = async (userId, overrides) => {
  const response = await api.put(`/api/rbac/users/${userId}/overrides`, {
    overrides,
  });
  return response.data;
};