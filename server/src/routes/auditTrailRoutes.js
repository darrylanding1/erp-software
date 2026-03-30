import express from 'express';
import { getAuditTrails } from '../controllers/auditTrailController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('audit_trails.view'), getAuditTrails);

export default router;