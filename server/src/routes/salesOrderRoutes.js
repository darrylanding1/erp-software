import express from 'express';
import {
  getSalesOrderMeta,
  getSalesOrders,
  createSalesOrder,
  approveSalesOrder,
  cancelSalesOrder,
  createInvoiceFromSalesOrder,
} from '../controllers/salesOrderController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('sales_orders.view'), attachDataScope, getSalesOrderMeta);
router.get('/', authorizePermissions('sales_orders.view'), attachDataScope, getSalesOrders);
router.post('/', authorizePermissions('sales_orders.create'), attachDataScope, createSalesOrder);
router.post('/:id/approve', authorizePermissions('sales_orders.update'), attachDataScope, approveSalesOrder);
router.post('/:id/cancel', authorizePermissions('sales_orders.update'), attachDataScope, cancelSalesOrder);
router.post(
  '/:id/create-invoice',
  authorizePermissions('sales_orders.update'),
  attachDataScope,
  createInvoiceFromSalesOrder
);

export default router;
