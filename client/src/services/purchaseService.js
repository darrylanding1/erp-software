import api from './api';

export const getPurchaseMeta = async () => {
  const response = await api.get('/api/purchases/meta');
  return response.data;
};

export const getPurchaseOrders = async (params = {}) => {
  const response = await api.get('/api/purchases', { params });
  return response.data;
};

export const createPurchaseOrder = async (payload) => {
  const response = await api.post('/api/purchases', payload);
  return response.data;
};

export const receivePurchaseOrder = async (id, payload) => {
  const response = await api.post(`/api/purchases/${id}/receive`, payload);
  return response.data;
};

export const getGoodsReceipts = async (params = {}) => {
  const response = await api.get('/api/purchases/receipts', { params });
  return response.data;
};

export const getInvoiceablePurchaseOrders = async () => {
  const response = await api.get('/api/purchases/invoiceable-pos');
  return response.data;
};

export const getApInvoices = async (params = {}) => {
  const response = await api.get('/api/purchases/ap-invoices', { params });
  return response.data;
};

export const createApInvoice = async (payload) => {
  const response = await api.post('/api/purchases/ap-invoices', payload);
  return response.data;
};

export const getPayableInvoices = async () => {
  const response = await api.get('/api/purchases/payable-invoices');
  return response.data;
};

export const getApPayments = async (params = {}) => {
  const response = await api.get('/api/purchases/ap-payments', { params });
  return response.data;
};

export const createApPayment = async (payload) => {
  const response = await api.post('/api/purchases/ap-payments', payload);
  return response.data;
};

export const getPurchaseJournalEntries = async () => {
  const response = await api.get('/api/purchases/journals');
  return response.data;
};