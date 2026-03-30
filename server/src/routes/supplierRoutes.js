import express from 'express';
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../controllers/supplierController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('suppliers.view'), getSuppliers);
router.get('/:id', authorizePermissions('suppliers.view'), getSupplierById);
router.post('/', authorizePermissions('suppliers.create'), createSupplier);
router.put('/:id', authorizePermissions('suppliers.update'), updateSupplier);
router.delete('/:id', authorizePermissions('suppliers.delete'), deleteSupplier);

export default router;