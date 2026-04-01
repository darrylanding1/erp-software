import express from 'express';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../controllers/customerController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('customers.view'), attachDataScope, getCustomers);
router.get('/:id', authorizePermissions('customers.view'), attachDataScope, getCustomerById);
router.post('/', authorizePermissions('customers.create'), attachDataScope, createCustomer);
router.put('/:id', authorizePermissions('customers.update'), attachDataScope, updateCustomer);
router.delete('/:id', authorizePermissions('customers.delete'), attachDataScope, deleteCustomer);

export default router;
