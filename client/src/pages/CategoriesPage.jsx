import { useEffect, useState } from 'react';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../services/categoryService';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import PermissionGate from '../components/auth/PermissionGate';

const initialForm = {
  name: '',
  description: '',
};

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingCategory, setEditingCategory] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
  });
  const [loading, setLoading] = useState(true);

  const fetchCategories = async (customFilters = filters) => {
    try {
      setLoading(true);
      const data = await getCategories(customFilters);
      setCategories(data);
    } catch (error) {
      console.error('Fetch categories failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchCategories(filters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [filters]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingCategory(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingCategory) {
        const updated = await updateCategory(editingCategory.id, form);
        setCategories((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
      } else {
        const created = await createCategory(form);
        setCategories((prev) => [created, ...prev]);
      }

      resetForm();
    } catch (error) {
      console.error('Save category failed:', error);
      alert(error?.response?.data?.message || 'Failed to save category');
    }
  };

  const handleEdit = (category) => {
    setEditingCategory(category);
    setForm({
      name: category.name || '',
      description: category.description || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm('Delete this category?');
    if (!confirmed) return;

    try {
      await deleteCategory(id);
      setCategories((prev) => prev.filter((item) => item.id !== id));

      if (editingCategory?.id === id) {
        resetForm();
      }
    } catch (error) {
      console.error('Delete category failed:', error);
      alert(error?.response?.data?.message || 'Failed to delete category');
    }
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
    });
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Categories"
        subtitle="Organize products into inventory categories."
        stats={[{ label: 'Total', value: categories.length }]}
      />

      <PermissionGate anyPermissions={['categories.create', 'categories.update']}>
        <SectionCard
          title={editingCategory ? 'Edit Category' : 'Add Category'}
          subtitle="Create and maintain product category records."
          action={
            editingCategory ? (
              <AppButton type="button" variant="ghost" size="sm" onClick={resetForm}>
                Cancel
              </AppButton>
            ) : null
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <input
                type="text"
                placeholder="Category Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none transition focus:border-[#9b6bff]"
                required
              />

              <input
                type="text"
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none transition focus:border-[#9b6bff]"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <PermissionGate
                permission={editingCategory ? 'categories.update' : 'categories.create'}
              >
                <AppButton type="submit">
                  {editingCategory ? 'Update Category' : 'Save Category'}
                </AppButton>
              </PermissionGate>
            </div>
          </form>
        </SectionCard>
      </PermissionGate>

      <SectionCard
        title="Category List"
        subtitle="Search and manage your categories."
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              type="text"
              placeholder="Search category name or description"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none transition focus:border-[#9b6bff]"
            />
          </div>

          {loading ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading categories...
            </div>
          ) : categories.length === 0 ? (
            <EmptyState message="No categories found." />
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-2xl border border-[#ebe4f7] bg-white shadow-sm xl:block">
                <table className="min-w-full">
                  <thead className="bg-[#f7f2ff]">
                    <tr className="text-left text-[#4d3188]">
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Description</th>
                      <th className="px-6 py-4">Created</th>
                      <th className="px-6 py-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1ebfb]">
                    {categories.map((category) => (
                      <tr key={category.id}>
                        <td className="px-6 py-4 font-medium text-[#2b2340]">
                          {category.name}
                        </td>
                        <td className="px-6 py-4 text-[#6e6487]">
                          {category.description || '-'}
                        </td>
                        <td className="px-6 py-4 text-[#6e6487]">
                          {new Date(category.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex justify-center gap-2">
                            <PermissionGate permission="categories.update">
                              <AppButton
                                type="button"
                                variant="ghost"
                                onClick={() => handleEdit(category)}
                              >
                                Edit
                              </AppButton>
                            </PermissionGate>
                            <PermissionGate permission="categories.delete">
                              <AppButton
                                type="button"
                                variant="danger"
                                onClick={() => handleDelete(category.id)}
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
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-[#4d3188]">{category.name}</h3>
                        <p className="mt-1 text-sm text-[#7c7494]">
                          Created: {new Date(category.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl bg-[#fcfaff] p-3 text-sm">
                      <p className="text-[#7c7494]">Description</p>
                      <p className="mt-1 font-semibold text-[#2b2340]">
                        {category.description || '-'}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <PermissionGate permission="categories.update">
                        <AppButton
                          type="button"
                          variant="ghost"
                          onClick={() => handleEdit(category)}
                        >
                          Edit
                        </AppButton>
                      </PermissionGate>
                      <PermissionGate permission="categories.delete">
                        <AppButton
                          type="button"
                          variant="danger"
                          onClick={() => handleDelete(category.id)}
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