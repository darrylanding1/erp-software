import { Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import CategoriesPage from './pages/CategoriesPage';
import MovementsPage from './pages/MovementsPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import PurchasePage from './pages/PurchasePage';
import SuppliersPage from './pages/SuppliersPage';
import AccountingPage from './pages/AccountingPage';
import FinancialStatementsPage from './pages/FinancialStatementsPage';
import SalesPage from './pages/SalesPage';
import DeliveryPage from './pages/DeliveryPage';
import SalesReturnPage from './pages/SalesReturnPage';
import CustomerRefundPage from './pages/CustomerRefundPage';
import LoginPage from './pages/LoginPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import AuditTrailPage from './pages/AuditTrailPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import SalesOrdersPage from './pages/SalesOrdersPage';
import AccountingPeriodsPage from './pages/AccountingPeriodsPage';
import MrpPlanningPage from './pages/MrpPlanningPage';
import PurchaseRequisitionsPage from './pages/PurchaseRequisitionsPage';
import GoodsReceiptsPage from './pages/GoodsReceiptsPage';
import AccessControlPage from './pages/AccessControlPage';
import useFormFieldAccessibility from './hooks/useFormFieldAccessibility';

const withLayout = (component) => <MainLayout>{component}</MainLayout>;

function App() {
  useFormFieldAccessibility();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      <Route element={<ProtectedRoute allPermissions={['dashboard.view']} />}>
        <Route path="/" element={withLayout(<DashboardPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['products.view']} />}>
        <Route path="/products" element={withLayout(<ProductsPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['categories.view']} />}>
        <Route path="/categories" element={withLayout(<CategoriesPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['inventory.view']} />}>
        <Route path="/movements" element={withLayout(<MovementsPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['inventory.view']} />}>
        <Route path="/reports" element={withLayout(<ReportsPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['purchases.view']} />}>
        <Route path="/purchases" element={withLayout(<PurchasePage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['purchase_requisitions.view']} />}>
        <Route
          path="/purchase-requisitions"
          element={withLayout(<PurchaseRequisitionsPage />)}
        />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['suppliers.view']} />}>
        <Route path="/suppliers" element={withLayout(<SuppliersPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['sales.view']} />}>
        <Route path="/sales" element={withLayout(<SalesPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['deliveries.view']} />}>
        <Route path="/deliveries" element={withLayout(<DeliveryPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['sales_returns.view']} />}>
        <Route path="/sales-returns" element={withLayout(<SalesReturnPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['sales_orders.view']} />}>
        <Route path="/sales-orders" element={withLayout(<SalesOrdersPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['goods_receipts.view']} />}>
        <Route path="/goods-receipts" element={withLayout(<GoodsReceiptsPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['accounting_periods.view']} />}>
        <Route
          path="/accounting-periods"
          element={withLayout(<AccountingPeriodsPage />)}
        />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['accounting.view']} />}>
        <Route path="/accounting" element={withLayout(<AccountingPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['financial_reports.view']} />}>
        <Route
          path="/financial-reports"
          element={withLayout(<FinancialStatementsPage />)}
        />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['customer_refunds.view']} />}>
        <Route path="/customer-refunds" element={withLayout(<CustomerRefundPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['audit_trails.view']} />}>
        <Route path="/audit-trail" element={withLayout(<AuditTrailPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['mrp.view']} />}>
        <Route path="/mrp" element={withLayout(<MrpPlanningPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['users.view']} />}>
        <Route path="/users" element={withLayout(<UsersPage />)} />
      </Route>

      <Route element={<ProtectedRoute allPermissions={['roles.manage']} />}>
        <Route path="/access-control" element={withLayout(<AccessControlPage />)} />
      </Route>

      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}

export default App;