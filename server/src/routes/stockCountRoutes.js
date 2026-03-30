import express from 'express';
import {
  getStockCountMeta,
  getStockCounts,
  getStockCountById,
  createStockCount,
  submitStockCount,
  approveStockCount,
  postStockCount,
  cancelStockCount,
} from '../controllers/stockCountController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('inventory.count'), getStockCountMeta);
router.get('/', authorizePermissions('inventory.count'), getStockCounts);
router.get('/:id', authorizePermissions('inventory.count'), getStockCountById);

router.post('/', authorizePermissions('inventory.count'), createStockCount);
router.post('/:id/submit', authorizePermissions('inventory.count'), submitStockCount);
router.post('/:id/approve', authorizePermissions('inventory.count'), approveStockCount);
router.post('/:id/post', authorizePermissions('inventory.count'), postStockCount);
router.post('/:id/cancel', authorizePermissions('inventory.count'), cancelStockCount);

export default router;