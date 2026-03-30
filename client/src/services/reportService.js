import api from './api';

export const getLowStockReport = async (threshold = 10) => {
  const response = await api.get('/api/reports/low-stock', {
    params: { threshold },
  });
  return response.data;
};