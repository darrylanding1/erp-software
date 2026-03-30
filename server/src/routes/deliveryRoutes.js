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

const router = express.Router();

router.use(authenticate);

router.get('/summary', authorizePermissions('deliveries.view'), getDeliveryDashboardSummary);
router.get('/candidates', authorizePermissions('deliveries.view'), getDeliveryCandidates);
router.get('/', authorizePermissions('deliveries.view'), getSalesDeliveries);
router.post('/', authorizePermissions('deliveries.create'), createSalesDelivery);

export default router;