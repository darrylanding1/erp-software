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

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('mrp.view'), getMrpMeta);
router.get('/policies', authorizePermissions('mrp.view'), getMrpPolicies);
router.post('/policies', authorizePermissions('mrp.run'), upsertMrpPolicy);

router.get('/recommendations', authorizePermissions('mrp.view'), getMrpRecommendations);

router.get('/runs', authorizePermissions('mrp.view'), getMrpRuns);
router.get('/runs/:id', authorizePermissions('mrp.view'), getMrpRunById);
router.post('/runs', authorizePermissions('mrp.run'), createMrpRun);

export default router;