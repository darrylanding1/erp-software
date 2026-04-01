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
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('suppliers.view'), attachDataScope, getSuppliers);
router.get('/:id', authorizePermissions('suppliers.view'), attachDataScope, getSupplierById);
router.post('/', authorizePermissions('suppliers.create'), attachDataScope, createSupplier);
router.put('/:id', authorizePermissions('suppliers.update'), attachDataScope, updateSupplier);
router.delete('/:id', authorizePermissions('suppliers.delete'), attachDataScope, deleteSupplier);

export default router;
