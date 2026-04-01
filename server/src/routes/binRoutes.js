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
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('inventory.view'), attachDataScope, getBinMeta);
router.get('/', authorizePermissions('inventory.view'), attachDataScope, getBins);
router.post('/', authorizePermissions('inventory.adjust'), attachDataScope, createBin);
router.put('/:id', authorizePermissions('inventory.adjust'), attachDataScope, updateBin);
router.patch(
  '/:id/status',
  authorizePermissions('inventory.adjust'),
  attachDataScope,
  updateBinStatus
);

export default router;
