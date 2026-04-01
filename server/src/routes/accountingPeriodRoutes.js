import express from 'express';
import {
  getAccountingPeriods,
  generateAccountingPeriods,
  getPostingLockStatus,
  softCloseAccountingPeriod,
  hardCloseAccountingPeriod,
  reopenAccountingPeriod,
  validatePostingDate,
} from '../controllers/accountingPeriodController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('accounting_periods.view'), attachDataScope, getAccountingPeriods);
router.post(
  '/generate',
  authorizePermissions('accounting_periods.manage'),
  attachDataScope,
  generateAccountingPeriods
);
router.get('/check', authorizePermissions('accounting_periods.view'), attachDataScope, getPostingLockStatus);
router.get('/validate', authorizePermissions('accounting_periods.view'), attachDataScope, validatePostingDate);
router.post(
  '/:id/soft-close',
  authorizePermissions('accounting_periods.manage'),
  attachDataScope,
  softCloseAccountingPeriod
);
router.post(
  '/:id/hard-close',
  authorizePermissions('accounting_periods.manage'),
  attachDataScope,
  hardCloseAccountingPeriod
);
router.post(
  '/:id/reopen',
  authorizePermissions('accounting_periods.manage'),
  attachDataScope,
  reopenAccountingPeriod
);

export default router;
