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
import { appRoutes } from './constants/rbacRoutes';

const withLayout = (component) => <MainLayout>{component}</MainLayout>;

const routeElementMap = {
  '/': <DashboardPage />,
  '/products': <ProductsPage />,
  '/categories': <CategoriesPage />,
  '/movements': <MovementsPage />,
  '/reports': <ReportsPage />,
  '/purchases': <PurchasePage />,
  '/purchase-requisitions': <PurchaseRequisitionsPage />,
  '/suppliers': <SuppliersPage />,
  '/sales': <SalesPage />,
  '/deliveries': <DeliveryPage />,
  '/sales-returns': <SalesReturnPage />,
  '/sales-orders': <SalesOrdersPage />,
  '/goods-receipts': <GoodsReceiptsPage />,
  '/accounting-periods': <AccountingPeriodsPage />,
  '/accounting': <AccountingPage />,
  '/financial-reports': <FinancialStatementsPage />,
  '/customer-refunds': <CustomerRefundPage />,
  '/audit-trail': <AuditTrailPage />,
  '/mrp': <MrpPlanningPage />,
  '/users': <UsersPage />,
  '/access-control': <AccessControlPage />,
};

function App() {
  useFormFieldAccessibility();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {appRoutes.map((route) => (
        <Route
          key={route.path}
          element={
            <ProtectedRoute
              allPermissions={route.allPermissions}
              anyPermissions={route.anyPermissions}
            />
          }
        >
          <Route path={route.path} element={withLayout(routeElementMap[route.path])} />
        </Route>
      ))}

      <Route path="*" element={<LoginPage />} />
    </Routes>
  );
}

export default App;