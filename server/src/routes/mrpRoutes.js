import express from 'express';
import {
  getMrpMeta,
  getMrpPolicies,
  upsertMrpPolicy,
  getMrpRecommendations,
  createMrpRun,
  getMrpRuns,
  getMrpRunById,
} from '../controllers/mrpController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('mrp.view'), attachDataScope, getMrpMeta);
router.get('/policies', authorizePermissions('mrp.view'), attachDataScope, getMrpPolicies);
router.post('/policies', authorizePermissions('mrp.run'), attachDataScope, upsertMrpPolicy);

router.get(
  '/recommendations',
  authorizePermissions('mrp.view'),
  attachDataScope,
  getMrpRecommendations
);

router.get('/runs', authorizePermissions('mrp.view'), attachDataScope, getMrpRuns);
router.get('/runs/:id', authorizePermissions('mrp.view'), attachDataScope, getMrpRunById);
router.post('/runs', authorizePermissions('mrp.run'), attachDataScope, createMrpRun);

export default router;
