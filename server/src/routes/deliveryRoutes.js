import express from 'express';
import {
  getDeliveryCandidates,
  getSalesDeliveries,
  createSalesDelivery,
  getDeliveryDashboardSummary,
} from '../controllers/deliveryController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/summary', authorizePermissions('deliveries.view'), attachDataScope, getDeliveryDashboardSummary);
router.get('/candidates', authorizePermissions('deliveries.view'), attachDataScope, getDeliveryCandidates);
router.get('/', authorizePermissions('deliveries.view'), attachDataScope, getSalesDeliveries);
router.post('/', authorizePermissions('deliveries.create'), attachDataScope, createSalesDelivery);

export default router;
