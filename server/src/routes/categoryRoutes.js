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

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('categories.view'), getCategories);
router.post('/', authorizePermissions('categories.create'), createCategory);
router.put('/:id', authorizePermissions('categories.update'), updateCategory);
router.delete('/:id', authorizePermissions('categories.delete'), deleteCategory);

export default router;