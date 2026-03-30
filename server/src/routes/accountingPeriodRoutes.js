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

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('accounting_periods.view'), getAccountingPeriods);
router.post(
  '/generate',
  authorizePermissions('accounting_periods.manage'),
  generateAccountingPeriods
);
router.get('/check', authorizePermissions('accounting_periods.view'), getPostingLockStatus);
router.get('/validate', authorizePermissions('accounting_periods.view'), validatePostingDate);
router.post(
  '/:id/soft-close',
  authorizePermissions('accounting_periods.manage'),
  softCloseAccountingPeriod
);
router.post(
  '/:id/hard-close',
  authorizePermissions('accounting_periods.manage'),
  hardCloseAccountingPeriod
);
router.post(
  '/:id/reopen',
  authorizePermissions('accounting_periods.manage'),
  reopenAccountingPeriod
);

export default router;