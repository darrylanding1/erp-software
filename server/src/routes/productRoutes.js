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
router.use(attachDataScope);

router.get('/meta', authorizePermissions('products.view'), getProductMeta);
router.get('/', authorizePermissions('products.view'), getProducts);
router.post('/', authorizePermissions('products.create'), createProduct);
router.put('/:id', authorizePermissions('products.update'), updateProduct);
router.delete('/:id', authorizePermissions('products.delete'), deleteProduct);

export default router;