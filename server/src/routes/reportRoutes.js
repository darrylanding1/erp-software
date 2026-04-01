import express from 'express';
import { getLowStockReport } from '../controllers/reportController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get(
  '/low-stock',
  authorizePermissions('inventory.view'),
  attachDataScope,
  getLowStockReport
);

export default router;
