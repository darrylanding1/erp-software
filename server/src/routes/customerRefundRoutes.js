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

const router = express.Router();

router.use(authenticate);

router.get('/candidates', authorizePermissions('customer_refunds.view'), getRefundCandidates);
router.get('/', authorizePermissions('customer_refunds.view'), getCustomerRefunds);
router.post('/', authorizePermissions('customer_refunds.create'), createCustomerRefund);

export default router;