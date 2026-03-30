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

const router = express.Router();

router.use(authenticate);

router.get('/candidates', authorizePermissions('sales_returns.view'), getReturnCandidates);
router.get(
  '/credit-memo-candidates',
  authorizePermissions('sales_returns.view'),
  getCreditMemoCandidates
);

router.get('/credit-memos', authorizePermissions('sales_returns.view'), getArCreditMemos);
router.post('/credit-memos', authorizePermissions('sales_returns.create'), createArCreditMemo);

router.get('/', authorizePermissions('sales_returns.view'), getSalesReturns);
router.post('/', authorizePermissions('sales_returns.create'), createSalesReturn);

export default router;