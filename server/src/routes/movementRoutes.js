import express from 'express';
import {
  getMovementMeta,
  getStockOverview,
  getTransfers,
  createTransfer,
  getMovements,
  createMovement,
} from '../controllers/movementController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('inventory.view'), attachDataScope, getMovementMeta);
router.get(
  '/stock-overview',
  authorizePermissions('inventory.view'),
  attachDataScope,
  getStockOverview
);
router.get('/transfers', authorizePermissions('inventory.view'), attachDataScope, getTransfers);
router.post('/transfers', authorizePermissions('inventory.transfer'), attachDataScope, createTransfer);

router.get('/', authorizePermissions('inventory.view'), attachDataScope, getMovements);
router.post('/', authorizePermissions('inventory.adjust'), attachDataScope, createMovement);

export default router;
