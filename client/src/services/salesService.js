import api from './api';

export const getCustomers = async (params = {}) => {
  const response = await api.get('/api/sales/customers', { params });
  return response.data;
};

export const createCustomer = async (payload) => {
  const response = await api.post('/api/sales/customers', payload);
  return response.data;
};

export const updateCustomer = async (id, payload) => {
  const response = await api.put(`/api/sales/customers/${id}`, payload);
  return response.data;
};

export const deleteCustomer = async (id) => {
  const response = await api.delete(`/api/sales/customers/${id}`);
  return response.data;
};

export const getSalesInvoices = async (params = {}) => {
  const response = await api.get('/api/sales/sales-invoices', { params });
  return response.data;
};

export const createSalesInvoice = async (payload) => {
  const response = await api.post('/api/sales/sales-invoices', payload);
  return response.data;
};

export const getCustomerPayments = async (params = {}) => {
  const response = await api.get('/api/sales/customer-payments', { params });
  return response.data;
};

export const createCustomerPayment = async (payload) => {
  const response = await api.post('/api/sales/customer-payments', payload);
  return response.data;
};

export const getArAgingReport = async (params = {}) => {
  const response = await api.get('/api/sales/ar-aging', { params });
  return response.data;
};

export const getCustomerLedger = async (params = {}) => {
  const response = await api.get('/api/sales/customer-ledger', { params });
  return response.data;
};