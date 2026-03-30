import express from 'express';
import {
  getBinMeta,
  getBins,
  createBin,
  updateBin,
  updateBinStatus,
} from '../controllers/binController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('inventory.view'), getBinMeta);
router.get('/', authorizePermissions('inventory.view'), getBins);
router.post('/', authorizePermissions('inventory.adjust'), createBin);
router.put('/:id', authorizePermissions('inventory.adjust'), updateBin);
router.patch('/:id/status', authorizePermissions('inventory.adjust'), updateBinStatus);

export default router;