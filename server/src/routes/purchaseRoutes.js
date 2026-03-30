import express from 'express';
import {
  getPurchaseMeta,
  getPurchaseOrders,
  createPurchaseOrder,
  receivePurchaseOrder,
  getGoodsReceipts,
  getApInvoices,
  getInvoiceablePurchaseOrders,
  createApInvoice,
  getApPayments,
  getPayableInvoices,
  createApPayment,
  getPurchaseJournalEntries,
  postApPayment,
} from '../controllers/purchaseController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('purchases.view'), attachDataScope, getPurchaseMeta);
router.get(
  '/receipts',
  authorizePermissions('goods_receipts.view'),
  attachDataScope,
  getGoodsReceipts
);
router.get(
  '/invoiceable-pos',
  authorizePermissions('purchases.view'),
  attachDataScope,
  getInvoiceablePurchaseOrders
);
router.get(
  '/ap-invoices',
  authorizePermissions('purchases.view'),
  attachDataScope,
  getApInvoices
);
router.get(
  '/payable-invoices',
  authorizePermissions('purchases.view'),
  attachDataScope,
  getPayableInvoices
);
router.get(
  '/ap-payments',
  authorizePermissions('purchases.view'),
  attachDataScope,
  getApPayments
);
router.get(
  '/journals',
  authorizePermissions('accounting.view'),
  attachDataScope,
  getPurchaseJournalEntries
);

router.get('/', authorizePermissions('purchases.view'), attachDataScope, getPurchaseOrders);

router.post('/', authorizePermissions('purchases.create'), attachDataScope, createPurchaseOrder);
router.post(
  '/ap-invoices',
  authorizePermissions('accounting.post'),
  attachDataScope,
  createApInvoice
);
router.post(
  '/ap-payments',
  authorizePermissions('accounting.post'),
  attachDataScope,
  createApPayment
);
router.post(
  '/ap-payments/:id/post',
  authorizePermissions('accounting.post'),
  attachDataScope,
  postApPayment
);
router.post(
  '/:id/receive',
  authorizePermissions('purchases.receive'),
  attachDataScope,
  receivePurchaseOrder
);

export default router;