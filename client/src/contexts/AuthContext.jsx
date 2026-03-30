import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getCurrentUser, loginUser } from '../services/authService';
import { getOrganizationMeta } from '../services/organizationService';

const AuthContext = createContext(null);

const readJsonStorage = (key, fallback = null) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
};

const normalizeScope = (scope) => ({
  company_id: scope?.company_id ? Number(scope.company_id) : null,
  branch_id: scope?.branch_id ? Number(scope.branch_id) : null,
  business_unit_id: scope?.business_unit_id ? Number(scope.business_unit_id) : null,
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readJsonStorage('inventory_user'));
  const [token, setToken] = useState(() => localStorage.getItem('inventory_token'));
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('inventory_token')));
  const [organizationMeta, setOrganizationMeta] = useState(null);
  const [activeScope, setActiveScopeState] = useState(() =>
    normalizeScope(readJsonStorage('inventory_active_scope'))
  );

  const persistActiveScope = (scope) => {
    const normalized = normalizeScope(scope);
    localStorage.setItem('inventory_active_scope', JSON.stringify(normalized));
    setActiveScopeState(normalized);
    return normalized;
  };

  const loadOrganizationContext = async (currentUser) => {
    try {
      const meta = await getOrganizationMeta();
      setOrganizationMeta(meta);

      const storedScope = normalizeScope(readJsonStorage('inventory_active_scope'));
      const defaultScope = normalizeScope({
        company_id: currentUser?.default_company_id ?? meta?.default_scope?.company_id,
        branch_id: currentUser?.default_branch_id ?? meta?.default_scope?.branch_id,
        business_unit_id:
          currentUser?.default_business_unit_id ?? meta?.default_scope?.business_unit_id,
      });

      const resolvedScope = storedScope?.company_id ? storedScope : defaultScope;

      if (resolvedScope?.company_id) {
        persistActiveScope(resolvedScope);
      }
    } catch (error) {
      console.error('Load organization context error:', error);
      setOrganizationMeta(null);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
        localStorage.setItem('inventory_user', JSON.stringify(currentUser));
        await loadOrganizationContext(currentUser);
      } catch (error) {
        console.error('Auth bootstrap error:', error);
        localStorage.removeItem('inventory_token');
        localStorage.removeItem('inventory_user');
        localStorage.removeItem('inventory_active_scope');
        setUser(null);
        setToken(null);
        setOrganizationMeta(null);
        setActiveScopeState(normalizeScope(null));
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [token]);

  const login = async (credentials) => {
    const data = await loginUser(credentials);
    localStorage.setItem('inventory_token', data.token);
    localStorage.setItem('inventory_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    await loadOrganizationContext(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('inventory_token');
    localStorage.removeItem('inventory_user');
    localStorage.removeItem('inventory_active_scope');
    setUser(null);
    setToken(null);
    setOrganizationMeta(null);
    setActiveScopeState(normalizeScope(null));
  };

  const refreshOrganizationMeta = async () => {
    const meta = await getOrganizationMeta();
    setOrganizationMeta(meta);
    return meta;
  };

  const permissionSet = new Set(user?.permissions || []);

  const hasPermission = (permission) => {
    if (!permission) return true;
    return permissionSet.has(permission);
  };

  const hasAnyPermission = (permissions = []) => {
    if (!Array.isArray(permissions) || permissions.length === 0) return true;
    return permissions.some((permission) => hasPermission(permission));
  };

  const hasAllPermissions = (permissions = []) => {
    if (!Array.isArray(permissions) || permissions.length === 0) return true;
    return permissions.every((permission) => hasPermission(permission));
  };

  const hasRole = (roleName) => {
    if (!roleName) return false;
    const roles = user?.roles || [];
    return roles.includes(roleName) || user?.role === roleName;
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      hasRole,
      organizationMeta,
      activeScope,
      setActiveScope: persistActiveScope,
      refreshOrganizationMeta,
    }),
    [user, token, loading, organizationMeta, activeScope]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}