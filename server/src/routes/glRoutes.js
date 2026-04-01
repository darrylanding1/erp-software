import express from 'express';
import {
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

router.get('/general-ledger', authorizePermissions('accounting.view'), attachDataScope, getGeneralLedger);
router.get('/trial-balance', authorizePermissions('accounting.view'), attachDataScope, getTrialBalance);

export default router;
