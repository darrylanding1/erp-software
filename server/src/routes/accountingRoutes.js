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
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get(
  '/chart-of-accounts',
  authorizePermissions('accounting.view'),
  attachDataScope,
  getChartOfAccounts
);
router.post(
  '/chart-of-accounts',
  authorizePermissions('accounting.post'),
  attachDataScope,
  createAccount
);
router.put(
  '/chart-of-accounts/:id',
  authorizePermissions('accounting.post'),
  attachDataScope,
  updateAccount
);
router.delete(
  '/chart-of-accounts/:id',
  authorizePermissions('accounting.post'),
  attachDataScope,
  deleteAccount
);

router.get(
  '/general-ledger',
  authorizePermissions('accounting.view'),
  attachDataScope,
  getGeneralLedger
);
router.get(
  '/trial-balance',
  authorizePermissions('accounting.view'),
  attachDataScope,
  getTrialBalance
);

export default router;
