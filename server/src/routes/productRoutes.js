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
import upload from '../config/multer.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', authorizePermissions('products.view'), getProductMeta);
router.get('/', authorizePermissions('products.view'), getProducts);

router.post(
  '/',
  authorizePermissions('products.create'),
  upload.single('image'),
  createProduct
);

router.put(
  '/:id',
  authorizePermissions('products.update'),
  upload.single('image'),
  updateProduct
);

router.delete('/:id', authorizePermissions('products.delete'), deleteProduct);

export default router;