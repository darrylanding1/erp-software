import api from './api';

export const getGoodsReceiptMeta = async () => {
  const response = await api.get('/api/goods-receipts/meta');
  return response.data;
};

export const getGoodsReceiptSuggestions = async (params = {}) => {
  const response = await api.get('/api/goods-receipts/suggestions', { params });
  return response.data;
};

export const getGoodsReceipts = async (params = {}) => {
  const response = await api.get('/api/goods-receipts', { params });
  return response.data;
};

export const getGoodsReceiptById = async (id) => {
  const response = await api.get(`/api/goods-receipts/${id}`);
  return response.data;
};

export const createGoodsReceiptFromPurchaseOrder = async (purchaseOrderId, payload) => {
  const response = await api.post('/api/goods-receipts', {
    ...payload,
    purchase_order_id: Number(purchaseOrderId),
  });
  return response.data;
};

export const postGoodsReceipt = async (id) => {
  const response = await api.post(`/api/goods-receipts/${id}/post`);
  return response.data;
};