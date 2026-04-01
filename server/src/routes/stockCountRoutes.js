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
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('inventory.count'), attachDataScope, getStockCountMeta);
router.get('/', authorizePermissions('inventory.count'), attachDataScope, getStockCounts);
router.get('/:id', authorizePermissions('inventory.count'), attachDataScope, getStockCountById);

router.post('/', authorizePermissions('inventory.count'), attachDataScope, createStockCount);
router.post('/:id/submit', authorizePermissions('inventory.count'), attachDataScope, submitStockCount);
router.post('/:id/approve', authorizePermissions('inventory.count'), attachDataScope, approveStockCount);
router.post('/:id/post', authorizePermissions('inventory.count'), attachDataScope, postStockCount);
router.post('/:id/cancel', authorizePermissions('inventory.count'), attachDataScope, cancelStockCount);

export default router;
