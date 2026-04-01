import express from 'express';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../controllers/customerController.js';
import {
  getSalesInvoices,
  createSalesInvoice,
  getCustomerPayments,
  createCustomerPayment,
  getArAgingReport,
  getCustomerLedger,
} from '../controllers/salesController.js';
import {
  authenticate,
  authorizePermissions,
} from '../middleware/authMiddleware.js';
import { attachDataScope } from '../middleware/dataScopeMiddleware.js';

const router = express.Router();

router.use(authenticate);

router.get('/customers', authorizePermissions('customers.view'), attachDataScope, getCustomers);
router.post('/customers', authorizePermissions('customers.create'), attachDataScope, createCustomer);
router.put('/customers/:id', authorizePermissions('customers.update'), attachDataScope, updateCustomer);
router.delete('/customers/:id', authorizePermissions('customers.delete'), attachDataScope, deleteCustomer);

router.get('/sales-invoices', authorizePermissions('sales.view'), attachDataScope, getSalesInvoices);
router.post('/sales-invoices', authorizePermissions('sales.create'), attachDataScope, createSalesInvoice);

router.get('/customer-payments', authorizePermissions('sales.view'), attachDataScope, getCustomerPayments);
router.post('/customer-payments', authorizePermissions('sales.create'), attachDataScope, createCustomerPayment);

router.get('/ar-aging', authorizePermissions('financial_reports.view'), attachDataScope, getArAgingReport);
router.get('/customer-ledger', authorizePermissions('financial_reports.view'), attachDataScope, getCustomerLedger);

router.get('/invoices', authorizePermissions('sales.view'), attachDataScope, getSalesInvoices);

export default router;
