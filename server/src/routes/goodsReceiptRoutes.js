import express from 'express';
import {
  getGoodsReceiptMeta,
  getGoodsReceiptSuggestions,
  getPurchaseOrderForReceipt,
  getGoodsReceipts,
  getGoodsReceiptById,
  createGoodsReceipt,
  postGoodsReceipt,
} from '../controllers/goodsReceiptController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('goods_receipts.view'), attachDataScope, getGoodsReceiptMeta);
router.get(
  '/suggestions',
  authorizePermissions('goods_receipts.view'),
  attachDataScope,
  getGoodsReceiptSuggestions
);
router.get(
  '/purchase-order/:id',
  authorizePermissions('goods_receipts.view'),
  attachDataScope,
  getPurchaseOrderForReceipt
);
router.get('/', authorizePermissions('goods_receipts.view'), attachDataScope, getGoodsReceipts);
router.get('/:id', authorizePermissions('goods_receipts.view'), attachDataScope, getGoodsReceiptById);
router.post('/', authorizePermissions('goods_receipts.create'), attachDataScope, createGoodsReceipt);
router.post('/:id/post', authorizePermissions('goods_receipts.post'), attachDataScope, postGoodsReceipt);

export default router;
