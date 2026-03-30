import express from 'express';
import { getLowStockReport } from '../controllers/reportController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get(
  '/low-stock',
  authorizePermissions('inventory.view'),
  getLowStockReport
);

export default router;