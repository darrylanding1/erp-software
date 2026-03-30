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

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('goods_receipts.view'), getGoodsReceiptMeta);
router.get(
  '/suggestions',
  authorizePermissions('goods_receipts.view'),
  getGoodsReceiptSuggestions
);
router.get(
  '/purchase-order/:id',
  authorizePermissions('goods_receipts.view'),
  getPurchaseOrderForReceipt
);
router.get('/', authorizePermissions('goods_receipts.view'), getGoodsReceipts);
router.get('/:id', authorizePermissions('goods_receipts.view'), getGoodsReceiptById);
router.post('/', authorizePermissions('goods_receipts.create'), createGoodsReceipt);
router.post('/:id/post', authorizePermissions('goods_receipts.post'), postGoodsReceipt);

export default router;