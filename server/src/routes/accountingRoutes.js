import express from 'express';
import {
  getChartOfAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getGeneralLedger,
  getTrialBalance,
} from '../controllers/accountingController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get(
  '/chart-of-accounts',
  authorizePermissions('accounting.view'),
  getChartOfAccounts
);
router.post(
  '/chart-of-accounts',
  authorizePermissions('accounting.post'),
  createAccount
);
router.put(
  '/chart-of-accounts/:id',
  authorizePermissions('accounting.post'),
  updateAccount
);
router.delete(
  '/chart-of-accounts/:id',
  authorizePermissions('accounting.post'),
  deleteAccount
);

router.get('/general-ledger', authorizePermissions('accounting.view'), getGeneralLedger);
router.get('/trial-balance', authorizePermissions('accounting.view'), getTrialBalance);

export default router;