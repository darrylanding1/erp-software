import { useEffect, useState } from 'react';
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../services/supplierService';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import PermissionGate from '../components/auth/PermissionGate';

const initialForm = {
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  address: '',
  status: 'Active',
};

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none transition focus:border-[#9b6bff]';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    status: '',
  });
  const [loading, setLoading] = useState(true);

  const fetchSuppliers = async (customFilters = filters) => {
    try {
      setLoading(true);
      const data = await getSuppliers(customFilters);
      setSuppliers(data);
    } catch (error) {
      console.error('Fetch suppliers failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchSuppliers(filters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [filters]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingSupplier(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingSupplier) {
        const updated = await updateSupplier(editingSupplier.id, form);
        setSuppliers((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
      } else {
        const created = await createSupplier(form);
        setSuppliers((prev) => [created, ...prev]);
      }

      resetForm();
    } catch (error) {
      console.error('Save supplier failed:', error);
      alert(error?.response?.data?.message || 'Failed to save supplier');
    }
  };

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setForm({
      name: supplier.name || '',
      contact_person: supplier.contact_person || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      status: supplier.status || 'Active',
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm('Delete this supplier?');
    if (!confirmed) return;

    try {
      await deleteSupplier(id);
      setSuppliers((prev) => prev.filter((item) => item.id !== id));

      if (editingSupplier?.id === id) {
        resetForm();
      }
    } catch (error) {
      console.error('Delete supplier failed:', error);
      alert(error?.response?.data?.message || 'Failed to delete supplier');
    }
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      status: '',
    });
  };

  const getStatusBadgeClass = (status) => {
    return status === 'Active'
      ? 'bg-green-100 text-green-700'
      : 'bg-red-100 text-red-700';
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Suppliers"
        subtitle="Manage supplier records for purchasing and restocking."
        stats={[
          { label: 'Total', value: suppliers.length },
          {
            label: 'Active',
            value: suppliers.filter((s) => s.status === 'Active').length,
          },
          {
            label: 'Inactive',
            value: suppliers.filter((s) => s.status === 'Inactive').length,
            variant: 'warning',
          },
        ]}
      />

      <PermissionGate anyPermissions={['suppliers.create', 'suppliers.update']}>
        <SectionCard
          title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
          subtitle="Create and maintain supplier information."
          action={
            editingSupplier ? (
              <AppButton type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </AppButton>
            ) : null
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <input
                type="text"
                name="name"
                placeholder="Supplier Name"
                value={form.name}
                onChange={handleChange}
                className={inputClassName}
                required
              />

              <input
                type="text"
                name="contact_person"
                placeholder="Contact Person"
                value={form.contact_person}
                onChange={handleChange}
                className={inputClassName}
              />

              <input
                type="email"
                name="email"
                placeholder="Email"
                value={form.email}
                onChange={handleChange}
                className={inputClassName}
              />

              <input
                type="text"
                name="phone"
                placeholder="Phone"
                value={form.phone}
                onChange={handleChange}
                className={inputClassName}
              />

              <input
                type="text"
                name="address"
                placeholder="Address"
                value={form.address}
                onChange={handleChange}
                className={inputClassName}
              />

              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className={inputClassName}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <PermissionGate
                permission={editingSupplier ? 'suppliers.update' : 'suppliers.create'}
              >
                <AppButton type="submit">
                  {editingSupplier ? 'Update Supplier' : 'Save Supplier'}
                </AppButton>
              </PermissionGate>

              {editingSupplier && (
                <AppButton type="button" variant="secondary" onClick={resetForm}>
                  Cancel Edit
                </AppButton>
              )}
            </div>
          </form>
        </SectionCard>
      </PermissionGate>

      <SectionCard
        title="Supplier List"
        subtitle="Search, filter, and manage supplier records."
        action={
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
          >
            Clear Filters
          </AppButton>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input
              type="text"
              placeholder="Search supplier, contact, email, or phone"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className={inputClassName}
            />

            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              className={inputClassName}
            >
              <option value="">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading suppliers...
            </div>
          ) : suppliers.length === 0 ? (
            <EmptyState message="No suppliers found." />
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-2xl border border-[#ebe4f7] bg-white shadow-sm xl:block">
                <table className="min-w-full text-center">
                  <thead className="bg-[#f7f2ff]">
                    <tr className="text-[#4d3188]">
                      <th className="px-6 py-4 text-center">Supplier</th>
                      <th className="px-6 py-4 text-center">Contact Person</th>
                      <th className="px-6 py-4 text-center">Email</th>
                      <th className="px-6 py-4 text-center">Phone</th>
                      <th className="px-6 py-4 text-center">Address</th>
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-center">Created</th>
                      <th className="px-6 py-4 text-center">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#f1ebfb]">
                    {suppliers.map((supplier) => (
                      <tr key={supplier.id} className="hover:bg-[#faf7ff]">
                        <td className="px-6 py-4 font-medium text-[#2b2340] text-center">
                          {supplier.name}
                        </td>
                        <td className="px-6 py-4 text-[#6e6487] text-center">
                          {supplier.contact_person || '-'}
                        </td>
                        <td className="px-6 py-4 text-[#6e6487] text-center">
                          {supplier.email || '-'}
                        </td>
                        <td className="px-6 py-4 text-[#6e6487] text-center">
                          {supplier.phone || '-'}
                        </td>
                        <td className="px-6 py-4 text-[#6e6487] text-center">
                          {supplier.address || '-'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getStatusBadgeClass(
                                supplier.status
                              )}`}
                            >
                              {supplier.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-[#6e6487] text-center">
                          {new Date(supplier.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2">
                            <PermissionGate permission="suppliers.update">
                              <AppButton
                                type="button"
                                variant="ghost"
                                onClick={() => handleEdit(supplier)}
                              >
                                Edit
                              </AppButton>
                            </PermissionGate>
                            <PermissionGate permission="suppliers.delete">
                              <AppButton
                                type="button"
                                variant="danger"
                                onClick={() => handleDelete(supplier.id)}
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

              <div className="grid grid-cols-1 gap-4 xl:hidden">
                {suppliers.map((supplier) => (
                  <div
                    key={supplier.id}
                    className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-[#4d3188]">{supplier.name}</h3>
                        <p className="mt-1 text-sm text-[#7c7494]">
                          {supplier.contact_person || 'No contact person'}
                        </p>
                      </div>

                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getStatusBadgeClass(
                          supplier.status
                        )}`}
                      >
                        {supplier.status}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                      <div className="rounded-2xl bg-[#fcfaff] p-3">
                        <p className="text-[#7c7494]">Email</p>
                        <p className="mt-1 break-all font-semibold text-[#2b2340]">
                          {supplier.email || '-'}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[#fcfaff] p-3">
                        <p className="text-[#7c7494]">Phone</p>
                        <p className="mt-1 font-semibold text-[#2b2340]">
                          {supplier.phone || '-'}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[#fcfaff] p-3">
                        <p className="text-[#7c7494]">Address</p>
                        <p className="mt-1 font-semibold text-[#2b2340]">
                          {supplier.address || '-'}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[#fcfaff] p-3">
                        <p className="text-[#7c7494]">Created</p>
                        <p className="mt-1 font-semibold text-[#2b2340]">
                          {new Date(supplier.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <PermissionGate permission="suppliers.update">
                        <AppButton
                          type="button"
                          variant="ghost"
                          onClick={() => handleEdit(supplier)}
                        >
                          Edit
                        </AppButton>
                      </PermissionGate>
                      <PermissionGate permission="suppliers.delete">
                        <AppButton
                          type="button"
                          variant="danger"
                          onClick={() => handleDelete(supplier.id)}
                        >
                          Delete
                        </AppButton>
                      </PermissionGate>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}