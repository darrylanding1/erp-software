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

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('inventory.view'), getInventoryAdjustments);
router.get('/:id', authorizePermissions('inventory.view'), getInventoryAdjustmentById);

router.post('/', authorizePermissions('inventory.adjust'), createInventoryAdjustment);
router.post('/:id/approve', authorizePermissions('inventory.adjust'), approveInventoryAdjustment);
router.post('/:id/reject', authorizePermissions('inventory.adjust'), rejectInventoryAdjustment);
router.post('/:id/post', authorizePermissions('inventory.adjust'), postInventoryAdjustment);

export default router;