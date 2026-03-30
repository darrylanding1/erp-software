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

const router = express.Router();

router.use(authenticate);

router.get('/', authorizePermissions('customers.view'), getCustomers);
router.get('/:id', authorizePermissions('customers.view'), getCustomerById);
router.post('/', authorizePermissions('customers.create'), createCustomer);
router.put('/:id', authorizePermissions('customers.update'), updateCustomer);
router.delete('/:id', authorizePermissions('customers.delete'), deleteCustomer);

export default router;