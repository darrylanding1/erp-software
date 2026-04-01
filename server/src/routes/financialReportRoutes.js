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
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('financial_reports.view'), attachDataScope, getFinancialReportMeta);
router.get('/trial-balance', authorizePermissions('financial_reports.view'), attachDataScope, getTrialBalance);
router.get('/general-ledger', authorizePermissions('financial_reports.view'), attachDataScope, getGeneralLedger);
router.get('/balance-sheet', authorizePermissions('financial_reports.view'), attachDataScope, getBalanceSheet);
router.get('/profit-loss', authorizePermissions('financial_reports.view'), attachDataScope, getProfitAndLoss);
router.get('/ar-aging', authorizePermissions('financial_reports.view'), attachDataScope, getArAgingReport);
router.get('/ap-aging', authorizePermissions('financial_reports.view'), attachDataScope, getApAgingReport);

export default router;
