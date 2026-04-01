import express from 'express';
import {
  getProductMeta,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/productController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('products.view'), attachDataScope, getProductMeta);
router.get('/', authorizePermissions('products.view'), attachDataScope, getProducts);
router.post('/', authorizePermissions('products.create'), attachDataScope, createProduct);
router.put('/:id', authorizePermissions('products.update'), attachDataScope, updateProduct);
router.delete('/:id', authorizePermissions('products.delete'), attachDataScope, deleteProduct);

export default router;
