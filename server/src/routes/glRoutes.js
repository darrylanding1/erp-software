import express from 'express';
import {
  getGeneralLedger,
  getTrialBalance,
} from '../controllers/accountingController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/general-ledger', authorizePermissions('accounting.view'), getGeneralLedger);
router.get('/trial-balance', authorizePermissions('accounting.view'), getTrialBalance);

export default router;