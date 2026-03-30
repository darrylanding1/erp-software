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

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('inventory.view'), getStockTransfers);
router.get('/:id', authorizePermissions('inventory.view'), getStockTransferById);

router.post('/', authorizePermissions('inventory.transfer'), createStockTransfer);
router.post('/:id/approve', authorizePermissions('inventory.transfer'), approveStockTransfer);
router.post('/:id/post', authorizePermissions('inventory.transfer'), postTransfer);
router.post('/:id/cancel', authorizePermissions('inventory.transfer'), cancelStockTransfer);

export default router;