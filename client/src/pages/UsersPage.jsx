import { useEffect, useMemo, useState } from 'react';
import {
  getUsers,
  getUsersMeta,
  createUser,
  updateUser,
  deleteUser,
} from '../services/userService';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import PermissionGate from '../components/auth/PermissionGate';

const initialForm = {
  full_name: '',
  email: '',
  role_code: '',
  status: 'Active',
  password: '',
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    status: '',
  });
  const [loading, setLoading] = useState(true);

  const defaultRoleCode = useMemo(
    () => roles[0]?.code || 'inventory_clerk',
    [roles]
  );

  const fetchMeta = async () => {
    try {
      const data = await getUsersMeta();
      setRoles(data.roles || []);
      setForm((prev) => ({
        ...prev,
        role_code: prev.role_code || data.roles?.[0]?.code || 'inventory_clerk',
      }));
    } catch (error) {
      console.error('Fetch users meta failed:', error);
    }
  };

  const fetchUsers = async (customFilters = filters) => {
    try {
      setLoading(true);
      const data = await getUsers(customFilters);
      setUsers(data);
    } catch (error) {
      console.error('Fetch users failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeta();
    fetchUsers();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchUsers(filters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [filters]);

  const resetForm = () => {
    setForm({
      ...initialForm,
      role_code: defaultRoleCode,
    });
    setEditingUser(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingUser) {
        const payload = { ...form };

        if (!payload.password) {
          delete payload.password;
        }

        const updated = await updateUser(editingUser.id, payload);
        setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await createUser({
          ...form,
          role_code: form.role_code || defaultRoleCode,
        });
        setUsers((prev) => [created, ...prev]);
      }

      resetForm();
    } catch (error) {
      console.error('Save user failed:', error);
      alert(error?.response?.data?.message || 'Failed to save user');
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setForm({
      full_name: user.full_name || '',
      email: user.email || '',
      role_code: user.role_code || defaultRoleCode,
      status: user.status || 'Active',
      password: '',
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm('Delete this user?');

    if (!confirmed) {
      return;
    }

    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((item) => item.id !== id));

      if (editingUser?.id === id) {
        resetForm();
      }
    } catch (error) {
      console.error('Delete user failed:', error);
      alert(error?.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      role: '',
      status: '',
    });
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage secured system users and their primary roles."
        stats={[
          { label: 'Total', value: users.length },
          { label: 'Active', value: users.filter((u) => u.status === 'Active').length },
          {
            label: 'Inactive',
            value: users.filter((u) => u.status === 'Inactive').length,
            variant: 'warning',
          },
        ]}
      />

      <PermissionGate anyPermissions={['users.create', 'users.update']}>
        <SectionCard
          title={editingUser ? 'Edit User' : 'Add User'}
          subtitle="Create and maintain user records. Passwords are hashed in the backend."
          action={
            editingUser ? (
              <AppButton type="button" onClick={resetForm} variant="ghost" size="sm">
                Cancel
              </AppButton>
            ) : null
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <input
                type="text"
                placeholder="Full Name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                required
              />

              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                required
              />

              <select
                value={form.role_code}
                onChange={(e) => setForm({ ...form, role_code: e.target.value })}
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.code}>
                    {role.name}
                  </option>
                ))}
              </select>

              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>

              <input
                type="password"
                placeholder={editingUser ? 'New password (optional)' : 'Password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                required={!editingUser}
                minLength={8}
              />
            </div>

            <PermissionGate permission={editingUser ? 'users.update' : 'users.create'}>
              <AppButton type="submit">
                {editingUser ? 'Update User' : 'Save User'}
              </AppButton>
            </PermissionGate>
          </form>
        </SectionCard>
      </PermissionGate>

      <SectionCard
        title="User List"
        subtitle="Search, filter, and manage users."
        action={
          <AppButton type="button" variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear Filters
          </AppButton>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="text"
              placeholder="Search name or email"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  search: e.target.value,
                }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />

            <select
              value={filters.role}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  role: e.target.value,
                }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Roles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.code}>
                  {role.name}
                </option>
              ))}
            </select>

            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  status: e.target.value,
                }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <EmptyState message="No users found." />
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
              <table className="min-w-full">
                <thead className="bg-[#f7f2ff]">
                  <tr className="text-left text-[#4d3188]">
                    <th className="px-6 py-4">Full Name</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Created</th>
                    <th className="px-6 py-4">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-t border-[#f1ebfb] text-sm text-[#5f547c]"
                    >
                      <td className="px-6 py-4 font-medium text-[#4d3188]">
                        {user.full_name}
                      </td>
                      <td className="px-6 py-4">{user.email}</td>
                      <td className="px-6 py-4">{user.role}</td>
                      <td className="px-6 py-4">{user.status}</td>
                      <td className="px-6 py-4">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <PermissionGate permission="users.update">
                            <AppButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(user)}
                            >
                              Edit
                            </AppButton>
                          </PermissionGate>
                          <PermissionGate permission="users.delete">
                            <AppButton
                              type="button"
                              variant="danger"
                              size="sm"
                              onClick={() => handleDelete(user.id)}
                            >
                              Delete
                            </AppButton>
                          </PermissionGate>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}