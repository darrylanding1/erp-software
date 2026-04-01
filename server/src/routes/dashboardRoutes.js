import express from 'express';
import { getDashboardData } from '../controllers/dashboardController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('dashboard.view'), attachDataScope, getDashboardData);

export default router;
