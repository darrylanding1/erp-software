import express from 'express';
import {
  getFinancialReportMeta,
  getTrialBalance,
  getGeneralLedger,
  getBalanceSheet,
  getProfitAndLoss,
  getArAgingReport,
  getApAgingReport,
} from '../controllers/financialReportController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('financial_reports.view'), getFinancialReportMeta);
router.get('/trial-balance', authorizePermissions('financial_reports.view'), getTrialBalance);
router.get('/general-ledger', authorizePermissions('financial_reports.view'), getGeneralLedger);
router.get('/balance-sheet', authorizePermissions('financial_reports.view'), getBalanceSheet);
router.get('/profit-loss', authorizePermissions('financial_reports.view'), getProfitAndLoss);
router.get('/ar-aging', authorizePermissions('financial_reports.view'), getArAgingReport);
router.get('/ap-aging', authorizePermissions('financial_reports.view'), getApAgingReport);

export default router;