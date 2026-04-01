import express from 'express';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('categories.view'), attachDataScope, getCategories);
router.post('/', authorizePermissions('categories.create'), attachDataScope, createCategory);
router.put('/:id', authorizePermissions('categories.update'), attachDataScope, updateCategory);
router.delete('/:id', authorizePermissions('categories.delete'), attachDataScope, deleteCategory);

export default router;
