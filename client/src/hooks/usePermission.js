import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function usePermission() {
  const {
    user,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    hasRole,
  } = useAuth();

  const permissionSet = useMemo(() => new Set(user?.permissions || []), [user?.permissions]);

  const can = (permission) => {
    if (!permission) return true;
    return hasPermission(permission);
  };

  const canAll = (permissions = []) => {
    if (!Array.isArray(permissions) || permissions.length === 0) return true;
    return hasAllPermissions(permissions);
  };

  const canAny = (permissions = []) => {
    if (!Array.isArray(permissions) || permissions.length === 0) return true;
    return hasAnyPermission(permissions);
  };

  const cannot = (permission) => !can(permission);

  const has = (permission) => permissionSet.has(permission);

  return {
    user,
    permissionSet,
    can,
    cannot,
    canAll,
    canAny,
    has,
    hasRole,
  };
}