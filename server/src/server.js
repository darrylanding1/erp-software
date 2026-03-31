import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import productRoutes from './routes/productRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import movementRoutes from './routes/movementRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import userRoutes from './routes/userRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import supplierRoutes from './routes/supplierRoutes.js';
import purchaseRoutes from './routes/purchaseRoutes.js';
import goodsReceiptRoutes from './routes/goodsReceiptRoutes.js';
import accountingRoutes from './routes/accountingRoutes.js';
import financialReportRoutes from './routes/financialReportRoutes.js';
import salesRoutes from './routes/salesRoutes.js';
import deliveryRoutes from './routes/deliveryRoutes.js';
import salesReturnRoutes from './routes/salesReturnRoutes.js';
import customerRefundRoutes from './routes/customerRefundRoutes.js';
import authRoutes from './routes/authRoutes.js';
import auditTrailRoutes from './routes/auditTrailRoutes.js';
import salesOrderRoutes from './routes/salesOrderRoutes.js';
import stockTransferRoutes from './routes/stockTransferRoutes.js';
import binRoutes from './routes/binRoutes.js';
import reservationRoutes from './routes/reservationRoutes.js';
import stockCountRoutes from './routes/stockCountRoutes.js';
import inventoryAdjustmentRoutes from './routes/inventoryAdjustmentRoutes.js';
import inventoryLedgerRoutes from './routes/inventoryLedgerRoutes.js';
import accountingPeriodRoutes from './routes/accountingPeriodRoutes.js';
import mrpRoutes from './routes/mrpRoutes.js';
import purchaseRequisitionRoutes from './routes/purchaseRequisitionRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import glRoutes from './routes/glRoutes.js';
import organizationRoutes from './routes/organizationRoutes.js';
import rbacRoutes from './routes/rbacRoutes.js';
import { authenticate } from './middleware/authMiddleware.js';
import { attachDataScope } from './middleware/dataScopeMiddleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:5173',
  'https://erp-software-git-main-bacolodwork-2207s-projects.vercel.app',
  process.env.CLIENT_URL,
  process.env.CORS_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());

app.get('/', (_req, res) => {
  res.send('Inventory API is running');
});

const mountScopedRoute = (routePath, router) => {
  app.use(routePath, authenticate, attachDataScope, router);
};

app.use('/api/auth', authRoutes);
app.use('/api/rbac', rbacRoutes);
app.use('/api/users', userRoutes);
app.use('/api/organization', organizationRoutes);

mountScopedRoute('/api/products', productRoutes);
mountScopedRoute('/api/categories', categoryRoutes);
mountScopedRoute('/api/movements', movementRoutes);
mountScopedRoute('/api/dashboard', dashboardRoutes);
mountScopedRoute('/api/reports', reportRoutes);
mountScopedRoute('/api/suppliers', supplierRoutes);
mountScopedRoute('/api/purchases', purchaseRoutes);
mountScopedRoute('/api/purchase-requisitions', purchaseRequisitionRoutes);
mountScopedRoute('/api/mrp', mrpRoutes);
mountScopedRoute('/api/accounting', accountingRoutes);
mountScopedRoute('/api/gl', glRoutes);
mountScopedRoute('/api/financial-reports', financialReportRoutes);
mountScopedRoute('/api/sales', salesRoutes);
mountScopedRoute('/api/deliveries', deliveryRoutes);
mountScopedRoute('/api/sales-returns', salesReturnRoutes);
mountScopedRoute('/api/customer-refunds', customerRefundRoutes);
mountScopedRoute('/api/audit-trails', auditTrailRoutes);
mountScopedRoute('/api/sales-orders', salesOrderRoutes);
mountScopedRoute('/api/goods-receipts', goodsReceiptRoutes);
mountScopedRoute('/api/customers', customerRoutes);
mountScopedRoute('/api/bins', binRoutes);
mountScopedRoute('/api/reservations', reservationRoutes);
mountScopedRoute('/api/stock-transfers', stockTransferRoutes);
mountScopedRoute('/api/stock-counts', stockCountRoutes);
mountScopedRoute('/api/inventory-adjustments', inventoryAdjustmentRoutes);
mountScopedRoute('/api/inventory-ledger', inventoryLedgerRoutes);
mountScopedRoute('/api/accounting-periods', accountingPeriodRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});