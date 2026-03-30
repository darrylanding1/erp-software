import express from 'express';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
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

const router = express.Router();

router.use(authenticate);

router.get('/customers', authorizePermissions('customers.view'), getCustomers);
router.post('/customers', authorizePermissions('customers.create'), createCustomer);
router.put('/customers/:id', authorizePermissions('customers.update'), updateCustomer);
router.delete('/customers/:id', authorizePermissions('customers.delete'), deleteCustomer);

router.get('/sales-invoices', authorizePermissions('sales.view'), getSalesInvoices);
router.post('/sales-invoices', authorizePermissions('sales.create'), createSalesInvoice);

router.get('/customer-payments', authorizePermissions('sales.view'), getCustomerPayments);
router.post('/customer-payments', authorizePermissions('sales.create'), createCustomerPayment);

router.get('/ar-aging', authorizePermissions('financial_reports.view'), getArAgingReport);
router.get('/customer-ledger', authorizePermissions('financial_reports.view'), getCustomerLedger);

router.get('/invoices', authorizePermissions('sales.view'), getSalesInvoices);

export default router;