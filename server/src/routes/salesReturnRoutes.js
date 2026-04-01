import express from 'express';
import {
  getReturnCandidates,
  getSalesReturns,
  createSalesReturn,
  getCreditMemoCandidates,
  getArCreditMemos,
  createArCreditMemo,
} from '../controllers/salesReturnController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/candidates', authorizePermissions('sales_returns.view'), attachDataScope, getReturnCandidates);
router.get(
  '/credit-memo-candidates',
  authorizePermissions('sales_returns.view'),
  attachDataScope,
  getCreditMemoCandidates
);

router.get('/credit-memos', authorizePermissions('sales_returns.view'), attachDataScope, getArCreditMemos);
router.post('/credit-memos', authorizePermissions('sales_returns.create'), attachDataScope, createArCreditMemo);

router.get('/', authorizePermissions('sales_returns.view'), attachDataScope, getSalesReturns);
router.post('/', authorizePermissions('sales_returns.create'), attachDataScope, createSalesReturn);

export default router;
