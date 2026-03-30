import api from '../../../client/src/services/api';

export const getFinancialReportMeta = async () => {
  const response = await api.get('/api/financial-reports/meta');
  return response.data;
};

export const getTrialBalance = async (params) => {
  const response = await api.get('/api/financial-reports/trial-balance', {
    params,
  });
  return response.data;
};

export const getGeneralLedger = async (params) => {
  const response = await api.get('/api/financial-reports/general-ledger', {
    params,
  });
  return response.data;
};

export const getBalanceSheet = async (params) => {
  const response = await api.get('/api/financial-reports/balance-sheet', {
    params,
  });
  return response.data;
};

export const getProfitAndLoss = async (params) => {
  const response = await api.get('/api/financial-reports/profit-loss', {
    params,
  });
  return response.data;
};

export const getArAgingReport = async (params) => {
  const response = await api.get('/api/financial-reports/ar-aging', {
    params,
  });
  return response.data;
};

export const getApAgingReport = async (params) => {
  const response = await api.get('/api/financial-reports/ap-aging', {
    params,
  });
  return response.data;
};