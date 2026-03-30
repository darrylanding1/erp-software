import { useEffect, useMemo, useState } from 'react';
import ProductForm from '../components/products/ProductForm';
import ProductTable from '../components/products/ProductTable';
import ProductFilters from '../components/products/ProductFilters';
import ProductCard from '../components/products/ProductCard';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import {
  getProducts,
  deleteProduct,
  getProductMeta,
} from '../services/productService';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [enums, setEnums] = useState({
    itemTypes: [],
    inventoryTrackingTypes: [],
    pickingStrategies: [],
    statuses: [],
  });
  const [editingProduct, setEditingProduct] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    category_id: '',
    status: '',
    item_type: '',
    is_active: '1',
    track_inventory: '',
  });
  const [loading, setLoading] = useState(true);

  const fetchMeta = async () => {
    try {
      const data = await getProductMeta();
      setCategories(data.categories || []);
      setWarehouses(data.warehouses || []);
      setEnums(
        data.enums || {
          itemTypes: [],
          inventoryTrackingTypes: [],
          pickingStrategies: [],
          statuses: [],
        }
      );
    } catch (error) {
      console.error('Failed to fetch product meta:', error);
    }
  };

  const fetchProducts = async (customFilters = filters) => {
    try {
      setLoading(true);
      const data = await getProducts(customFilters);
      setProducts(data);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeta();
    fetchProducts();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchProducts(filters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [filters]);

  const handleSaveProduct = () => {
    fetchProducts();
    setEditingProduct(null);
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingProduct(null);
  };

  const handleDeleteProduct = async (id) => {
    const confirmed = window.confirm('Delete this item?');
    if (!confirmed) return;

    try {
      await deleteProduct(id);
      setProducts((prev) => prev.filter((item) => item.id !== id));

      if (editingProduct?.id === id) {
        setEditingProduct(null);
      }
    } catch (error) {
      console.error('Failed to delete product:', error);
      alert(error?.response?.data?.message || 'Failed to delete product');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      search: '',
      category_id: '',
      status: '',
      item_type: '',
      is_active: '1',
      track_inventory: '',
    });
  };

  const stats = useMemo(
    () => [
      { label: 'Total Items', value: products.length },
      {
        label: 'Active',
        value: products.filter((p) => Number(p.is_active) === 1).length,
      },
      {
        label: 'Inventory',
        value: products.filter((p) => p.item_type === 'Inventory').length,
      },
      {
        label: 'Low / Out',
        value: products.filter(
          (p) => p.status === 'Low Stock' || p.status === 'Out of Stock'
        ).length,
        variant: 'warning',
      },
    ],
    [products]
  );

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Product & Item Master"
        subtitle="Manage item master data, pricing, inventory controls, and ERP attributes."
        stats={stats}
      />

      <ProductForm
        onSaveProduct={handleSaveProduct}
        editingProduct={editingProduct}
        onCancelEdit={handleCancelEdit}
        categories={categories}
        warehouses={warehouses}
        enums={enums}
      />

      <SectionCard
        title="Item Master List"
        subtitle="Search, filter, edit, and maintain your item catalog."
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
          <ProductFilters
            filters={filters}
            onChange={handleFilterChange}
            onClear={handleClearFilters}
            categories={categories}
            enums={enums}
          />

          {loading ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading items...
            </div>
          ) : products.length === 0 ? (
            <EmptyState message="No items found." />
          ) : (
            <>
              <ProductTable
                products={products}
                onEdit={handleEditProduct}
                onDelete={handleDeleteProduct}
              />

              <div className="grid grid-cols-1 gap-4 md:hidden">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onEdit={handleEditProduct}
                    onDelete={handleDeleteProduct}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}