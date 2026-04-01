import express from 'express';
import {
  getRefundCandidates,
  getCustomerRefunds,
  createCustomerRefund,
} from '../controllers/customerRefundController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/candidates', authorizePermissions('customer_refunds.view'), attachDataScope, getRefundCandidates);
router.get('/', authorizePermissions('customer_refunds.view'), attachDataScope, getCustomerRefunds);
router.post('/', authorizePermissions('customer_refunds.create'), attachDataScope, createCustomerRefund);

export default router;
