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

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('sales_orders.view'), getSalesOrderMeta);
router.get('/', authorizePermissions('sales_orders.view'), getSalesOrders);
router.post('/', authorizePermissions('sales_orders.create'), createSalesOrder);
router.post('/:id/approve', authorizePermissions('sales_orders.update'), approveSalesOrder);
router.post('/:id/cancel', authorizePermissions('sales_orders.update'), cancelSalesOrder);
router.post(
  '/:id/create-invoice',
  authorizePermissions('sales_orders.update'),
  createInvoiceFromSalesOrder
);

export default router;