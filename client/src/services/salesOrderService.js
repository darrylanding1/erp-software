import api from './api';

export const getSalesOrderMeta = async () => {
  const response = await api.get('/api/sales-orders/meta');
  return response.data;
};

export const getSalesOrders = async (params = {}) => {
  const response = await api.get('/api/sales-orders', { params });
  return response.data;
};

export const createSalesOrder = async (payload) => {
  const response = await api.post('/api/sales-orders', payload);
  return response.data;
};

export const approveSalesOrder = async (id) => {
  const response = await api.post(`/api/sales-orders/${id}/approve`);
  return response.data;
};

export const cancelSalesOrder = async (id) => {
  const response = await api.post(`/api/sales-orders/${id}/cancel`);
  return response.data;
};

export const createInvoiceFromSalesOrder = async (id, payload) => {
  const response = await api.post(`/api/sales-orders/${id}/create-invoice`, payload);
  return response.data;
};