import api from './api';

export const getPurchaseRequisitionMeta = async () => {
  const response = await api.get('/api/purchase-requisitions/meta');
  return response.data;
};

export const getPurchaseRequisitions = async (params = {}) => {
  const response = await api.get('/api/purchase-requisitions', { params });
  return response.data;
};

export const getPurchaseRequisitionById = async (id) => {
  const response = await api.get(`/api/purchase-requisitions/${id}`);
  return response.data;
};

export const createPurchaseRequisitionFromMrpRun = async (runId, payload) => {
  const response = await api.post(`/api/purchase-requisitions/from-mrp-run/${runId}`, payload);
  return response.data;
};

export const submitPurchaseRequisition = async (id) => {
  const response = await api.post(`/api/purchase-requisitions/${id}/submit`);
  return response.data;
};

export const approvePurchaseRequisition = async (id) => {
  const response = await api.post(`/api/purchase-requisitions/${id}/approve`);
  return response.data;
};

export const convertPurchaseRequisitionToPo = async (id, payload) => {
  const response = await api.post(`/api/purchase-requisitions/${id}/convert-to-po`, payload);
  return response.data;
};