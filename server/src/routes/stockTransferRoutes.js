import express from 'express';
import {
  getStockTransfers,
  getStockTransferById,
  createStockTransfer,
  approveStockTransfer,
  postTransfer,
  cancelStockTransfer,
} from '../controllers/stockTransferController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('inventory.view'), attachDataScope, getStockTransfers);
router.get('/:id', authorizePermissions('inventory.view'), attachDataScope, getStockTransferById);

router.post('/', authorizePermissions('inventory.transfer'), attachDataScope, createStockTransfer);
router.post(
  '/:id/approve',
  authorizePermissions('inventory.transfer'),
  attachDataScope,
  approveStockTransfer
);
router.post('/:id/post', authorizePermissions('inventory.transfer'), attachDataScope, postTransfer);
router.post(
  '/:id/cancel',
  authorizePermissions('inventory.transfer'),
  attachDataScope,
  cancelStockTransfer
);

export default router;
