import express from 'express';
import {
  assignUserOrganizationScope,
  createBranch,
  createBusinessUnit,
  createCompany,
  getOrganizationMeta,
  getUserOrganizationScopes,
} from '../controllers/organizationController.js';
import { authenticate, authorizePermissions } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('organization.view'), getOrganizationMeta);
router.get(
  '/users/:userId/scopes',
  authorizePermissions('organization.view'),
  getUserOrganizationScopes
);

router.post('/companies', authorizePermissions('organization.manage'), createCompany);
router.post('/branches', authorizePermissions('organization.manage'), createBranch);
router.post(
  '/business-units',
  authorizePermissions('organization.manage'),
  createBusinessUnit
);
router.post(
  '/users/:userId/scopes',
  authorizePermissions('organization.manage'),
  assignUserOrganizationScope
);

export default router;