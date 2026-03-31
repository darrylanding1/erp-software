import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import OrganizationScopeSwitcher from '../components/common/OrganizationScopeSwitcher';
import { appRoutes } from '../constants/rbacRoutes';

export default function MainLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, hasAllPermissions, hasAnyPermission } = useAuth();

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
      appRoutes.filter((item) => {
        if (item.allPermissions?.length) {
          return hasAllPermissions(item.allPermissions);
        }

        if (item.anyPermissions?.length) {
          return hasAnyPermission(item.anyPermissions);
        }

        return true;
      }),
    [hasAllPermissions, hasAnyPermission]
  );

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const renderNavItems = (mobile = false) => (
    <ul className="space-y-1.5">
      {visibleMenuItems.map((item) => {
        const Icon = item.icon;

        return (
          <li key={item.path}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              onClick={mobile ? () => setSidebarOpen(false) : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium transition ${
                  isActive
                    ? 'bg-[#efe4ff] text-[#6d3fd1]'
                    : 'text-[#6e6487] hover:bg-[#f7f2ff]'
                }`
              }
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          </li>
        );
      })}
    </ul>
  );

  const sidebarContent = (mobile = false) => (
    <>
      <div className="border-b border-[#f3eef9] px-4 py-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#a59bbf]">User</p>
        <p className="mt-1 truncate text-sm font-semibold text-[#4d3188]">{user?.full_name}</p>
        <p className="truncate text-[11px] text-[#8a82a3]">{user?.email}</p>

        <span className="mt-2 inline-flex rounded-full bg-[#f4efff] px-2 py-0.5 text-[10px] font-semibold text-[#6d3fd1]">
          {user?.role}
        </span>

        <div className="mt-2">
          <OrganizationScopeSwitcher />
        </div>
      </div>

      <nav className="sidebar-scroll flex-1 overflow-y-auto px-4 py-4">
        {renderNavItems(mobile)}
      </nav>

      <div className="border-t border-[#f3eef9] p-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#f1ecf8] px-4 py-3 font-semibold text-[#4d3188] transition hover:bg-[#f7f2ff]"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f8f5ff]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-[#f1ecf8] bg-white md:flex md:flex-col">
        {sidebarContent()}
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close sidebar overlay"
            className="absolute inset-0 bg-black/20"
            onClick={() => setSidebarOpen(false)}
          />

          <aside className="relative z-50 flex h-full w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            {sidebarContent(true)}
          </aside>
        </div>
      )}

      <div className="min-h-screen md:pl-72">
        <div className="flex min-h-screen min-w-0 flex-col">
          <header className="sticky top-0 z-30 border-b border-[#f1ecf8] bg-white/90 backdrop-blur md:hidden">
            <div className="flex items-center justify-between px-4 py-4">
              <div>
                <h1 className="text-lg font-bold text-[#4d3188]">Inventory Pro</h1>
                <p className="text-xs text-[#7c7494]">Management Panel</p>
              </div>

              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="rounded-2xl border border-[#f1ecf8] p-2 text-[#4d3188]"
              >
                <Menu size={20} />
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
