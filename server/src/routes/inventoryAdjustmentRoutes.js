import express from 'express';
import {
  getInventoryAdjustments,
  getInventoryAdjustmentById,
  createInventoryAdjustment,
  approveInventoryAdjustment,
  rejectInventoryAdjustment,
  postInventoryAdjustment,
} from '../controllers/inventoryAdjustmentController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('inventory.view'), attachDataScope, getInventoryAdjustments);
router.get('/:id', authorizePermissions('inventory.view'), attachDataScope, getInventoryAdjustmentById);

router.post('/', authorizePermissions('inventory.adjust'), attachDataScope, createInventoryAdjustment);
router.post(
  '/:id/approve',
  authorizePermissions('inventory.adjust'),
  attachDataScope,
  approveInventoryAdjustment
);
router.post(
  '/:id/reject',
  authorizePermissions('inventory.adjust'),
  attachDataScope,
  rejectInventoryAdjustment
);
router.post(
  '/:id/post',
  authorizePermissions('inventory.adjust'),
  attachDataScope,
  postInventoryAdjustment
);

export default router;
