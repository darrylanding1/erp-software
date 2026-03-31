import { useEffect, useMemo, useState } from 'react';
import AppButton from '../common/AppButton';
import { createProduct, updateProduct } from '../../services/productService';

const getInitialFormData = () => ({
  name: '',
  description: '',
  sku: '',
  category_id: '',
  item_type: 'Inventory',
  product_group: '',
  brand: '',
  uom: 'PCS',
  barcode: '',
  base_price: '0',
  market_price: '0',
  standard_cost: '0',
  selling_price: '0',
  reorder_point: '10',
  min_stock_level: '0',
  max_stock_level: '0',
  preferred_warehouse_id: '',
  track_inventory: true,
  is_saleable: true,
  is_purchaseable: true,
  is_active: true,
  tax_code: '',
  country_of_origin: '',
  hs_code: '',
  notes: '',
  inventory_tracking_type: 'NONE',
  is_bin_managed: true,
  is_expiry_tracked: false,
  picking_strategy: 'FIFO',
  is_lot_tracked: false,
  is_serial_tracked: false,
});

export default function ProductForm({
  onSaveProduct,
  editingProduct,
  onCancelEdit,
  categories = [],
  warehouses = [],
  enums = {
    itemTypes: ['Inventory', 'Service', 'Non-Inventory'],
    inventoryTrackingTypes: ['NONE', 'LOT', 'SERIAL'],
    pickingStrategies: ['MANUAL', 'FIFO', 'FEFO'],
  },
}) {
  const [formData, setFormData] = useState(getInitialFormData());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editingProduct) {
      setFormData({
        name: editingProduct.name || '',
        description: editingProduct.description || '',
        sku: editingProduct.sku || '',
        category_id: editingProduct.category_id || '',
        item_type: editingProduct.item_type || 'Inventory',
        product_group: editingProduct.product_group || '',
        brand: editingProduct.brand || '',
        uom: editingProduct.uom || 'PCS',
        barcode: editingProduct.barcode || '',
        base_price: editingProduct.base_price ?? '0',
        market_price: editingProduct.market_price ?? '0',
        standard_cost: editingProduct.standard_cost ?? editingProduct.base_price ?? '0',
        selling_price: editingProduct.selling_price ?? editingProduct.market_price ?? '0',
        reorder_point: editingProduct.reorder_point ?? '10',
        min_stock_level: editingProduct.min_stock_level ?? '0',
        max_stock_level: editingProduct.max_stock_level ?? '0',
        preferred_warehouse_id: editingProduct.preferred_warehouse_id || '',
        track_inventory: Number(editingProduct.track_inventory) === 1,
        is_saleable: Number(editingProduct.is_saleable) === 1,
        is_purchaseable: Number(editingProduct.is_purchaseable) === 1,
        is_active: Number(editingProduct.is_active) === 1,
        tax_code: editingProduct.tax_code || '',
        country_of_origin: editingProduct.country_of_origin || '',
        hs_code: editingProduct.hs_code || '',
        notes: editingProduct.notes || '',
        inventory_tracking_type: editingProduct.inventory_tracking_type || 'NONE',
        is_bin_managed: Number(editingProduct.is_bin_managed) === 1,
        is_expiry_tracked: Number(editingProduct.is_expiry_tracked) === 1,
        picking_strategy: editingProduct.picking_strategy || 'FIFO',
        is_lot_tracked: Number(editingProduct.is_lot_tracked) === 1,
        is_serial_tracked: Number(editingProduct.is_serial_tracked) === 1,
      });
    } else {
      setFormData(getInitialFormData());
    }
  }, [editingProduct]);

  const isInventoryItem = useMemo(
    () => formData.item_type === 'Inventory',
    [formData.item_type]
  );

  useEffect(() => {
    if (!isInventoryItem) {
      setFormData((prev) => ({
        ...prev,
        track_inventory: false,
        inventory_tracking_type: 'NONE',
        is_lot_tracked: false,
        is_serial_tracked: false,
        is_expiry_tracked: false,
      }));
    }
  }, [isInventoryItem]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => {
      const nextValue = type === 'checkbox' ? checked : value;
      const next = {
        ...prev,
        [name]: nextValue,
      };

      if (name === 'inventory_tracking_type') {
        next.is_lot_tracked = value === 'LOT';
        next.is_serial_tracked = value === 'SERIAL';
      }

      if (name === 'item_type' && value !== 'Inventory') {
        next.track_inventory = false;
        next.inventory_tracking_type = 'NONE';
        next.is_lot_tracked = false;
        next.is_serial_tracked = false;
        next.is_expiry_tracked = false;
      }

      return next;
    });
  };

  const resetForm = () => {
    setFormData(getInitialFormData());
  };

  const handleCancel = () => {
    resetForm();
    onCancelEdit?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const savedProduct = editingProduct
        ? await updateProduct(editingProduct.id, formData)
        : await createProduct(formData);

      onSaveProduct(savedProduct);
      resetForm();
    } catch (error) {
      console.error('Save product failed:', error);
      alert(error?.response?.data?.message || 'Failed to save item');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none focus:border-[#9b6bff] sm:text-base';
  const checkboxLabelClass =
    'flex items-center gap-3 rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] px-4 py-3 text-sm text-[#2b2340]';

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#4d3188] sm:text-xl">
            {editingProduct ? 'Edit Item Master' : 'Add Item Master'}
          </h2>
          <p className="mt-1 text-sm text-[#7c7494]">
            ERP item master with pricing, stock controls, and item attributes.
          </p>
        </div>

        {editingProduct && (
          <AppButton type="button" variant="ghost" size="sm" onClick={handleCancel}>
            Cancel
          </AppButton>
        )}
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#7c7494]">
            Basic
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <input
              type="text"
              name="name"
              placeholder="Item Name"
              value={formData.name}
              onChange={handleChange}
              className={inputClass}
              required
            />

            <input
              type="text"
              name="sku"
              placeholder="SKU / Item Code"
              value={formData.sku}
              onChange={handleChange}
              className={inputClass}
              required
            />

            <input
              type="text"
              name="barcode"
              placeholder="Barcode"
              value={formData.barcode}
              onChange={handleChange}
              className={inputClass}
            />

            <select
              name="category_id"
              value={formData.category_id}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="">Select Category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <select
              name="item_type"
              value={formData.item_type}
              onChange={handleChange}
              className={inputClass}
            >
              {enums.itemTypes.map((itemType) => (
                <option key={itemType} value={itemType}>
                  {itemType}
                </option>
              ))}
            </select>

            <input
              type="text"
              name="product_group"
              placeholder="Product Group"
              value={formData.product_group}
              onChange={handleChange}
              className={inputClass}
            />

            <input
              type="text"
              name="brand"
              placeholder="Brand"
              value={formData.brand}
              onChange={handleChange}
              className={inputClass}
            />

            <input
              type="text"
              name="uom"
              placeholder="UOM"
              value={formData.uom}
              onChange={handleChange}
              className={inputClass}
            />

            <textarea
              name="description"
              placeholder="Description"
              value={formData.description}
              onChange={handleChange}
              className={`${inputClass} md:col-span-2 2xl:col-span-4`}
              rows={3}
            />
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#7c7494]">
            Pricing
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <input
              type="number"
              step="0.0001"
              name="base_price"
              placeholder="Base Price"
              value={formData.base_price}
              onChange={handleChange}
              className={inputClass}
            />

            <input
              type="number"
              step="0.0001"
              name="market_price"
              placeholder="Market Price"
              value={formData.market_price}
              onChange={handleChange}
              className={inputClass}
            />

            <input
              type="number"
              step="0.0001"
              name="standard_cost"
              placeholder="Standard Cost"
              value={formData.standard_cost}
              onChange={handleChange}
              className={inputClass}
            />

            <input
              type="number"
              step="0.0001"
              name="selling_price"
              placeholder="Selling Price"
              value={formData.selling_price}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#7c7494]">
            Inventory Control
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <input
              type="number"
              step="0.0001"
              name="reorder_point"
              placeholder="Reorder Point"
              value={formData.reorder_point}
              onChange={handleChange}
              className={inputClass}
            />

            <input
              type="number"
              step="0.0001"
              name="min_stock_level"
              placeholder="Min Stock Level"
              value={formData.min_stock_level}
              onChange={handleChange}
              className={inputClass}
            />

            <input
              type="number"
              step="0.0001"
              name="max_stock_level"
              placeholder="Max Stock Level"
              value={formData.max_stock_level}
              onChange={handleChange}
              className={inputClass}
            />

            <select
              name="preferred_warehouse_id"
              value={formData.preferred_warehouse_id}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="">Preferred Warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>

            <select
              name="inventory_tracking_type"
              value={formData.inventory_tracking_type}
              onChange={handleChange}
              className={inputClass}
              disabled={!isInventoryItem}
            >
              {enums.inventoryTrackingTypes.map((trackingType) => (
                <option key={trackingType} value={trackingType}>
                  {trackingType}
                </option>
              ))}
            </select>

            <select
              name="picking_strategy"
              value={formData.picking_strategy}
              onChange={handleChange}
              className={inputClass}
            >
              {enums.pickingStrategies.map((strategy) => (
                <option key={strategy} value={strategy}>
                  {strategy}
                </option>
              ))}
            </select>

            <div className={checkboxLabelClass}>
              <input
                type="checkbox"
                name="track_inventory"
                checked={formData.track_inventory}
                onChange={handleChange}
                disabled={!isInventoryItem}
              />
              <span>Track Inventory</span>
            </div>

            <div className={checkboxLabelClass}>
              <input
                type="checkbox"
                name="is_bin_managed"
                checked={formData.is_bin_managed}
                onChange={handleChange}
              />
              <span>Bin Managed</span>
            </div>

            <div className={checkboxLabelClass}>
              <input
                type="checkbox"
                name="is_expiry_tracked"
                checked={formData.is_expiry_tracked}
                onChange={handleChange}
                disabled={!isInventoryItem}
              />
              <span>Expiry Tracked</span>
            </div>

            <div className={checkboxLabelClass}>
              <input
                type="checkbox"
                name="is_lot_tracked"
                checked={formData.is_lot_tracked}
                onChange={handleChange}
                disabled
              />
              <span>Lot Tracked</span>
            </div>

            <div className={checkboxLabelClass}>
              <input
                type="checkbox"
                name="is_serial_tracked"
                checked={formData.is_serial_tracked}
                onChange={handleChange}
                disabled
              />
              <span>Serial Tracked</span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#7c7494]">
            Commercial / Compliance
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <input
              type="text"
              name="tax_code"
              placeholder="Tax Code"
              value={formData.tax_code}
              onChange={handleChange}
              className={inputClass}
            />

            <input
              type="text"
              name="country_of_origin"
              placeholder="Country of Origin"
              value={formData.country_of_origin}
              onChange={handleChange}
              className={inputClass}
            />

            <input
              type="text"
              name="hs_code"
              placeholder="HS Code"
              value={formData.hs_code}
              onChange={handleChange}
              className={inputClass}
            />

            <textarea
              name="notes"
              placeholder="Notes"
              value={formData.notes}
              onChange={handleChange}
              className={`${inputClass} md:col-span-2 2xl:col-span-4`}
              rows={3}
            />

            <div className={checkboxLabelClass}>
              <input
                type="checkbox"
                name="is_saleable"
                checked={formData.is_saleable}
                onChange={handleChange}
              />
              <span>Saleable</span>
            </div>

            <div className={checkboxLabelClass}>
              <input
                type="checkbox"
                name="is_purchaseable"
                checked={formData.is_purchaseable}
                onChange={handleChange}
              />
              <span>Purchaseable</span>
            </div>

            <div className={checkboxLabelClass}>
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
              />
              <span>Active</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <AppButton type="submit" disabled={loading}>
          {loading ? 'Saving...' : editingProduct ? 'Update Item' : 'Save Item'}
        </AppButton>
      </div>
    </form>
  );
}