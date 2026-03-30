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

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('inventory.view'), getMovementMeta);
router.get(
  '/stock-overview',
  authorizePermissions('inventory.view'),
  getStockOverview
);
router.get('/transfers', authorizePermissions('inventory.view'), getTransfers);
router.post('/transfers', authorizePermissions('inventory.transfer'), createTransfer);

router.get('/', authorizePermissions('inventory.view'), getMovements);
router.post('/', authorizePermissions('inventory.adjust'), createMovement);

export default router;