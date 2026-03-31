import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Boxes,
  ArrowLeftRight,
  ClipboardList,
  Menu,
  X,
  User,
  Truck,
  Building2,
  BookOpen,
  FileBarChart2,
  ShoppingCart,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  LogOut,
  History,
  FileText,
  Factory,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import OrganizationScopeSwitcher from '../components/common/OrganizationScopeSwitcher';

const menuItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard, allPermissions: ['dashboard.view'] },
  { name: 'Products', path: '/products', icon: Package, allPermissions: ['products.view'] },
  { name: 'Categories', path: '/categories', icon: Boxes, allPermissions: ['categories.view'] },
  { name: 'Stock Movements', path: '/movements', icon: ArrowLeftRight, allPermissions: ['inventory.view'] },
  { name: 'Suppliers', path: '/suppliers', icon: Building2, allPermissions: ['suppliers.view'] },
  { name: 'Purchases', path: '/purchases', icon: Truck, allPermissions: ['purchases.view'] },
  { name: 'Purchase Requisitions', path: '/purchase-requisitions', icon: ClipboardList, allPermissions: ['purchase_requisitions.view'] },
  { name: 'Goods Receipts', path: '/goods-receipts', icon: PackageCheck, allPermissions: ['goods_receipts.view'] },
  { name: 'Sales', path: '/sales', icon: ShoppingCart, allPermissions: ['sales.view'] },
  { name: 'Deliveries', path: '/deliveries', icon: PackageCheck, allPermissions: ['deliveries.view'] },
  { name: 'Sales Returns', path: '/sales-returns', icon: RotateCcw, allPermissions: ['sales_returns.view'] },
  { name: 'Sales Orders', path: '/sales-orders', icon: FileText, allPermissions: ['sales_orders.view'] },
  { name: 'Accounting', path: '/accounting', icon: BookOpen, allPermissions: ['accounting.view'] },
  { name: 'Financial Reports', path: '/financial-reports', icon: FileBarChart2, allPermissions: ['financial_reports.view'] },
  { name: 'MRP / Replenishment', path: '/mrp', icon: Factory, allPermissions: ['mrp.view'] },
  { name: 'Reports', path: '/reports', icon: ClipboardList, allPermissions: ['inventory.view'] },
  { name: 'Accounting Periods', path: '/accounting-periods', icon: FileText, allPermissions: ['accounting_periods.view'] },
  { name: 'Users', path: '/users', icon: User, allPermissions: ['users.view'] },
  { name: 'Access Control', path: '/access-control', icon: KeyRound, allPermissions: ['roles.manage'] },
  { name: 'Audit Trail', path: '/audit-trail', icon: History, allPermissions: ['audit_trails.view'] },
  { name: 'Customer Refunds', path: '/customer-refunds', icon: ShieldCheck, allPermissions: ['customer_refunds.view'] },
];

export default function MainLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, hasAllPermissions, hasAnyPermission } = useAuth();

  // prevent background scroll on mobile
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  const visibleMenuItems = useMemo(
    () =>
      menuItems.filter((item) => {
        if (item.allPermissions?.length) return hasAllPermissions(item.allPermissions);
        if (item.anyPermissions?.length) return hasAnyPermission(item.anyPermissions);
        return true;
      }),
    [hasAllPermissions, hasAnyPermission]
  );

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const renderNavItems = (mobile = false) => (
    <ul className="space-y-2">
      {visibleMenuItems.map((item) => {
        const Icon = item.icon;

        return (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              onClick={mobile ? () => setSidebarOpen(false) : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 font-medium transition ${
                  isActive
                    ? 'bg-[#efe4ff] text-[#6d3fd1]'
                    : 'text-[#6e6487] hover:bg-[#f7f2ff]'
                }`
              }
            >
              <Icon size={20} />
              <span>{item.name}</span>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );

  const sidebarContent = (mobile = false) => (
    <>
      {/* HEADER */}
      <div className="border-b border-[#f1ecf8] px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#4d3188]">Inventory Pro</h1>
            <p className="text-xs text-[#8a82a3]">Management Panel</p>
          </div>

          {mobile && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-xl border border-[#f1ecf8]"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ✅ SMALL CLEAN ACTIVE SCOPE */}
      <div className="border-b border-[#f1ecf8] px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-[#a59bbf]">
          User
        </p>

        <p className="mt-1 text-sm font-semibold text-[#4d3188] truncate">
          {user?.full_name}
        </p>

        <p className="text-[11px] text-[#8a82a3] truncate">
          {user?.email}
        </p>

        <div className="mt-1 flex items-center justify-between">
          <span className="rounded-full bg-[#f4efff] px-2 py-[2px] text-[10px] font-semibold text-[#6d3fd1]">
            {user?.role}
          </span>
        </div>

        <div className="mt-1 scale-90 origin-top-left">
          <OrganizationScopeSwitcher />
        </div>
      </div>

      {/* MENU */}
      <nav className="flex-1 overflow-y-auto px-4 py-5">
        {renderNavItems(mobile)}
      </nav>

      {/* FOOTER */}
      <div className="border-t border-[#f1ecf8] p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#f1ecf8] px-4 py-3 font-semibold text-[#4d3188] hover:bg-[#f7f2ff]"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f8f5ff]">
      {/* DESKTOP SIDEBAR */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 bg-white border-r border-[#f1ecf8] md:flex flex-col">
        {sidebarContent()}
      </aside>

      {/* MOBILE SIDEBAR */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setSidebarOpen(false)}
          />

          <aside className="relative z-50 w-72 h-full bg-white shadow-xl flex flex-col">
            {sidebarContent(true)}
          </aside>
        </div>
      )}

      {/* CONTENT */}
      <div className="md:pl-72">
        <header className="sticky top-0 z-30 bg-white border-b border-[#f1ecf8] md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <h1 className="font-bold text-[#4d3188]">Inventory</h1>

            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 border border-[#f1ecf8] rounded-xl"
            >
              <Menu size={20} />
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}