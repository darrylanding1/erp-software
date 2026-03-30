import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function ProtectedRoute({
  allowedRoles = [],
  requiredPermissions = [],
  allPermissions = [],
  anyPermissions = [],
  requireAllPermissions = true,
}) {
  const {
    isAuthenticated,
    loading,
    user,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
  } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f5ff] px-6">
        <div className="rounded-3xl border border-[#ebe4f7] bg-white px-8 py-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-[#4d3188]">Loading session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0) {
    const roles = user?.roles || [];
    const hasAllowedRole =
      roles.some((role) => allowedRoles.includes(role)) ||
      allowedRoles.includes(user?.role);

    if (!hasAllowedRole) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  const normalizedAllPermissions =
    allPermissions.length > 0
      ? allPermissions
      : requireAllPermissions
      ? requiredPermissions
      : [];

  const normalizedAnyPermissions =
    anyPermissions.length > 0
      ? anyPermissions
      : !requireAllPermissions
      ? requiredPermissions
      : [];

  if (normalizedAllPermissions.length > 0 && !hasAllPermissions(normalizedAllPermissions)) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (normalizedAnyPermissions.length > 0 && !hasAnyPermission(normalizedAnyPermissions)) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (
    normalizedAllPermissions.length === 0 &&
    normalizedAnyPermissions.length === 0 &&
    requiredPermissions.length > 0
  ) {
    const passed = requireAllPermissions
      ? requiredPermissions.every((permission) => hasPermission(permission))
      : requiredPermissions.some((permission) => hasPermission(permission));

    if (!passed) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <Outlet />;
}