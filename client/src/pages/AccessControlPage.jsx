import { useEffect, useMemo, useState } from 'react';
import {
  getRbacMeta,
  updateRolePermissions,
  getUserOverrides,
  saveUserOverrides,
} from '../services/rbacService';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';

export default function AccessControlPage() {
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [meta, setMeta] = useState({
    roles: [],
    permissions: [],
    matrix: [],
    users: [],
  });
  const [selectedRoleCode, setSelectedRoleCode] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [rolePermissionCodes, setRolePermissionCodes] = useState(new Set());
  const [userOverrideMap, setUserOverrideMap] = useState({});
  const [selectedUserData, setSelectedUserData] = useState(null);

  const selectedRole = useMemo(
    () => meta.matrix.find((item) => item.role_code === selectedRoleCode) || null,
    [meta.matrix, selectedRoleCode]
  );

  const permissionModules = useMemo(() => meta.permissions || [], [meta.permissions]);

  const loadMeta = async () => {
    try {
      setLoading(true);
      const data = await getRbacMeta();
      setMeta(data);

      const firstRoleCode = data.matrix?.[0]?.role_code || '';
      setSelectedRoleCode((prev) => prev || firstRoleCode);

      const firstUserId = data.users?.[0]?.id || '';
      setSelectedUserId((prev) => prev || String(firstUserId || ''));
    } catch (error) {
      console.error('Load RBAC meta failed:', error);
      alert(error?.response?.data?.message || 'Failed to load access control data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    if (!selectedRole) return;

    const granted = [];

    Object.values(selectedRole.modules || {}).forEach((items) => {
      items.forEach((permission) => {
        if (permission.granted) {
          granted.push(permission.code);
        }
      });
    });

    setRolePermissionCodes(new Set(granted));
  }, [selectedRole]);

  useEffect(() => {
    const loadUserOverrides = async () => {
      if (!selectedUserId) return;

      try {
        const data = await getUserOverrides(selectedUserId);
        setSelectedUserData(data.user);

        const nextMap = {};
        (data.overrides || []).forEach((item) => {
          nextMap[item.permission_code] = item.effect;
        });
        setUserOverrideMap(nextMap);
      } catch (error) {
        console.error('Load user overrides failed:', error);
        alert(error?.response?.data?.message || 'Failed to load user overrides');
      }
    };

    loadUserOverrides();
  }, [selectedUserId]);

  const toggleRolePermission = (permissionCode) => {
    setRolePermissionCodes((prev) => {
      const next = new Set(prev);

      if (next.has(permissionCode)) {
        next.delete(permissionCode);
      } else {
        next.add(permissionCode);
      }

      return next;
    });
  };

  const setOverrideEffect = (permissionCode, effect) => {
    setUserOverrideMap((prev) => {
      const next = { ...prev };

      if (!effect) {
        delete next[permissionCode];
      } else {
        next[permissionCode] = effect;
      }

      return next;
    });
  };

  const handleSaveRole = async () => {
    if (!selectedRole) return;

    try {
      setSavingRole(true);
      await updateRolePermissions(selectedRole.role_id, [...rolePermissionCodes]);
      await loadMeta();
      alert('Role permission matrix updated successfully');
    } catch (error) {
      console.error('Save role permissions failed:', error);
      alert(error?.response?.data?.message || 'Failed to update role permissions');
    } finally {
      setSavingRole(false);
    }
  };

  const handleSaveOverrides = async () => {
    if (!selectedUserId) return;

    try {
      setSavingUser(true);

      const overrides = Object.entries(userOverrideMap).map(([permission_code, effect]) => ({
        permission_code,
        effect,
      }));

      const response = await saveUserOverrides(selectedUserId, overrides);
      setSelectedUserData(response.user);
      alert('User overrides updated successfully');
    } catch (error) {
      console.error('Save user overrides failed:', error);
      alert(error?.response?.data?.message || 'Failed to save user overrides');
    } finally {
      setSavingUser(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl border border-[#ebe4f7] bg-white p-6 text-[#7c7494] shadow-sm">
        Loading access control...
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Access Control"
        subtitle="Manage the role permission matrix and user-level allow/deny overrides."
        stats={[
          { label: 'Roles', value: meta.roles.length },
          { label: 'Users', value: meta.users.length },
          {
            label: 'Permissions',
            value: permissionModules.reduce(
              (sum, module) => sum + (module.permissions?.length || 0),
              0
            ),
          },
        ]}
      />

      <SectionCard
        title="Role Permission Matrix"
        subtitle="Base permissions come from roles. User overrides are applied after this matrix."
        action={
          <div className="flex items-center gap-3">
            <select
              value={selectedRoleCode}
              onChange={(e) => setSelectedRoleCode(e.target.value)}
              className="rounded-2xl border border-[#ebe4f7] px-4 py-2.5 outline-none focus:border-[#9b6bff]"
            >
              {meta.roles.map((role) => (
                <option key={role.id} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>

            <AppButton type="button" onClick={handleSaveRole} disabled={savingRole}>
              {savingRole ? 'Saving...' : 'Save Matrix'}
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          {permissionModules.map((module) => (
            <div
              key={module.module_name}
              className="rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] p-4"
            >
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f85aa]">
                {module.module_name}
              </h3>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {module.permissions.map((permission) => {
                  const checked = rolePermissionCodes.has(permission.code);

                  return (
                    <label
                      key={permission.code}
                      className="flex items-start gap-3 rounded-2xl border border-[#ebe4f7] bg-white px-4 py-3 text-sm text-[#5f547c]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRolePermission(permission.code)}
                        className="mt-1"
                      />
                      <div>
                        <p className="font-semibold text-[#4d3188]">{permission.name}</p>
                        <p className="text-xs text-[#7c7494]">{permission.code}</p>
                        {permission.description ? (
                          <p className="mt-1 text-xs text-[#7c7494]">{permission.description}</p>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="User Permission Overrides"
        subtitle="Override model: deny beats allow, allow beats role grant, everything else is denied."
        action={
          <div className="flex items-center gap-3">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="rounded-2xl border border-[#ebe4f7] px-4 py-2.5 outline-none focus:border-[#9b6bff]"
            >
              {meta.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} ({user.role_name || 'No Role'})
                </option>
              ))}
            </select>

            <AppButton type="button" onClick={handleSaveOverrides} disabled={savingUser}>
              {savingUser ? 'Saving...' : 'Save Overrides'}
            </AppButton>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedUserData ? (
            <div className="rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] p-4 text-sm text-[#5f547c]">
              <p>
                <span className="font-semibold text-[#4d3188]">User:</span>{' '}
                {selectedUserData.full_name}
              </p>
              <p>
                <span className="font-semibold text-[#4d3188]">Primary Role:</span>{' '}
                {selectedUserData.role || '—'}
              </p>
              <p className="mt-2">
                <span className="font-semibold text-[#4d3188]">Effective Permissions:</span>{' '}
                {selectedUserData.permissions?.length || 0}
              </p>
            </div>
          ) : null}

          {permissionModules.map((module) => (
            <div
              key={module.module_name}
              className="rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] p-4"
            >
              <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f85aa]">
                {module.module_name}
              </h3>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-[#ebe4f7] bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#f7f2ff] text-[#4d3188]">
                    <tr>
                      <th className="px-4 py-3 text-left">Permission</th>
                      <th className="px-4 py-3 text-left">Code</th>
                      <th className="px-4 py-3 text-left">Override</th>
                    </tr>
                  </thead>
                  <tbody>
                    {module.permissions.map((permission) => (
                      <tr key={permission.code} className="border-t border-[#f1ebfb]">
                        <td className="px-4 py-3">
                          <div className="font-medium text-[#4d3188]">{permission.name}</div>
                          {permission.description ? (
                            <div className="text-xs text-[#7c7494]">{permission.description}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-[#7c7494]">{permission.code}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setOverrideEffect(permission.code, '')}
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                !userOverrideMap[permission.code]
                                  ? 'bg-slate-200 text-slate-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              Inherit
                            </button>
                            <button
                              type="button"
                              onClick={() => setOverrideEffect(permission.code, 'allow')}
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                userOverrideMap[permission.code] === 'allow'
                                  ? 'bg-emerald-200 text-emerald-900'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              Allow
                            </button>
                            <button
                              type="button"
                              onClick={() => setOverrideEffect(permission.code, 'deny')}
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                userOverrideMap[permission.code] === 'deny'
                                  ? 'bg-red-200 text-red-900'
                                  : 'bg-red-50 text-red-700'
                              }`}
                            >
                              Deny
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}