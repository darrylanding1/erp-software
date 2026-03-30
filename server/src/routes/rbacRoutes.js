import express from 'express';
import {
  getRbacAdminData,
  getUserOverrides,
  saveUserOverrides,
  updateRoleMatrix,
} from '../controllers/rbacController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);
router.use(authorizePermissions('roles.manage'));

router.get('/meta', getRbacAdminData);
router.put('/roles/:roleId/permissions', updateRoleMatrix);
router.get('/users/:userId/overrides', getUserOverrides);
router.put('/users/:userId/overrides', saveUserOverrides);

export default router;