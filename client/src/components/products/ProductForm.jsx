import { useEffect, useMemo, useState } from 'react';
import AppButton from '../common/AppButton';
import PermissionGate from '../auth/PermissionGate';
import { createProduct, updateProduct } from '../../services/productService';

const prettyJson = (value, fallback) => JSON.stringify(value ?? fallback, null, 2);

const getInitialFormData = () => ({
  name: '',
  description: '',
  sku: '',
  category_id: '',
  item_type: 'Inventory',
  item_status: 'ACTIVE',
  lifecycle_stage: '',
  material_type: '',
  product_group: '',
  brand: '',
  barcode: '',
  base_uom_code: 'PCS',
  sales_uom_code: 'PCS',
  purchase_uom_code: 'PCS',
  issue_uom_code: 'PCS',
  conversion_mode: 'SINGLE_BASE',
  base_price: '0',
  market_price: '0',
  standard_cost: '0',
  selling_price: '0',
  valuation_method: 'MOVING_AVERAGE',
  procurement_type: 'BUY',
  planning_strategy: 'REORDER_POINT',
  reorder_point: '10',
  min_stock_level: '0',
  max_stock_level: '0',
  safety_stock: '0',
  min_order_qty: '0',
  max_order_qty: '0',
  fixed_lot_size: '0',
  lead_time_days: '0',
  shelf_life_days: '0',
  abc_class: '',
  cycle_count_class: '',
  preferred_warehouse_id: '',
  track_inventory: true,
  is_saleable: true,
  is_purchaseable: true,
  is_active: true,
  inventory_tracking_type: 'NONE',
  is_bin_managed: true,
  is_expiry_tracked: false,
  picking_strategy: 'FIFO',
  is_lot_tracked: false,
  is_serial_tracked: false,
  serial_number_profile: '',
  lot_number_profile: '',
  quality_inspection_required: false,
  batch_management_enabled: false,
  returnable_item: false,
  tax_code: '',
  tax_category_code: '',
  input_tax_code: '',
  output_tax_code: '',
  country_of_origin: '',
  hs_code: '',
  manufacturer_name: '',
  manufacturer_part_number: '',
  revenue_account_code: '',
  inventory_account_code: '',
  cogs_account_code: '',
  expense_account_code: '',
  net_weight: '0',
  gross_weight: '0',
  weight_uom: 'KG',
  length_value: '0',
  width_value: '0',
  height_value: '0',
  dimension_uom: 'CM',
  image_url: '',
  notes: '',
  variant_group: '',
  parent_product_id: '',
  variant_code: '',
  is_variant_parent: false,
  is_variant: false,
  variant_attributes: '[]',
  alternate_uoms: '[]',
  vendor_item_mappings: '[]',
  sales_defaults: '{}',
  purchasing_defaults: '{}',
  mrp_defaults: '{}',
  quality_defaults: '{}',
  accounting_defaults: '{}',
  tax_metadata: '{}',
  compliance_metadata: '{}',
});

const sectionTitleClass = 'mb-3 text-sm font-semibold uppercase tracking-wide text-[#7c7494]';
const inputClass = 'rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none focus:border-[#9b6bff] sm:text-base';
const checkboxLabelClass = 'flex items-center gap-3 rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] px-4 py-3 text-sm text-[#2b2340]';

const JsonField = ({ label, name, value, onChange, rows = 5, helper }) => (
  <div className="space-y-2">
    <label className="block text-sm font-medium text-[#4d3188]">{label}</label>
    <textarea name={name} value={value} onChange={onChange} rows={rows} className={`${inputClass} w-full font-mono`} />
    {helper ? <p className="text-xs text-[#7c7494]">{helper}</p> : null}
  </div>
);

export default function ProductForm({
  onSaveProduct,
  editingProduct,
  onCancelEdit,
  categories = [],
  warehouses = [],
  parentProducts = [],
  enums = {
    itemTypes: ['Inventory', 'Service', 'Non-Inventory'],
    inventoryTrackingTypes: ['NONE', 'LOT', 'SERIAL'],
    pickingStrategies: ['MANUAL', 'FIFO', 'FEFO'],
    itemStatuses: ['DRAFT', 'ACTIVE', 'BLOCKED', 'DISCONTINUED'],
    valuationMethods: ['STANDARD', 'MOVING_AVERAGE', 'FIFO'],
    procurementTypes: ['BUY', 'MAKE', 'BOTH'],
    planningStrategies: ['MANUAL', 'REORDER_POINT', 'MIN_MAX', 'MRP'],
    conversionModes: ['SINGLE_BASE', 'MULTI_UOM'],
    abcClasses: ['A', 'B', 'C'],
  },
}) {
  const [formData, setFormData] = useState(getInitialFormData());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!editingProduct) {
      setFormData(getInitialFormData());
      return;
    }

    setFormData({
      name: editingProduct.name || '',
      description: editingProduct.description || '',
      sku: editingProduct.sku || '',
      category_id: editingProduct.category_id || '',
      item_type: editingProduct.item_type || 'Inventory',
      item_status: editingProduct.item_status || 'ACTIVE',
      lifecycle_stage: editingProduct.lifecycle_stage || '',
      material_type: editingProduct.material_type || '',
      product_group: editingProduct.product_group || '',
      brand: editingProduct.brand || '',
      barcode: editingProduct.barcode || '',
      base_uom_code: editingProduct.base_uom_code || editingProduct.uom || 'PCS',
      sales_uom_code: editingProduct.sales_uom_code || editingProduct.base_uom_code || editingProduct.uom || 'PCS',
      purchase_uom_code: editingProduct.purchase_uom_code || editingProduct.base_uom_code || editingProduct.uom || 'PCS',
      issue_uom_code: editingProduct.issue_uom_code || editingProduct.base_uom_code || editingProduct.uom || 'PCS',
      conversion_mode: editingProduct.conversion_mode || 'SINGLE_BASE',
      base_price: String(editingProduct.base_price ?? 0),
      market_price: String(editingProduct.market_price ?? 0),
      standard_cost: String(editingProduct.standard_cost ?? 0),
      selling_price: String(editingProduct.selling_price ?? 0),
      valuation_method: editingProduct.valuation_method || 'MOVING_AVERAGE',
      procurement_type: editingProduct.procurement_type || 'BUY',
      planning_strategy: editingProduct.planning_strategy || 'REORDER_POINT',
      reorder_point: String(editingProduct.reorder_point ?? 0),
      min_stock_level: String(editingProduct.min_stock_level ?? 0),
      max_stock_level: String(editingProduct.max_stock_level ?? 0),
      safety_stock: String(editingProduct.safety_stock ?? 0),
      min_order_qty: String(editingProduct.min_order_qty ?? 0),
      max_order_qty: String(editingProduct.max_order_qty ?? 0),
      fixed_lot_size: String(editingProduct.fixed_lot_size ?? 0),
      lead_time_days: String(editingProduct.lead_time_days ?? 0),
      shelf_life_days: String(editingProduct.shelf_life_days ?? 0),
      abc_class: editingProduct.abc_class || '',
      cycle_count_class: editingProduct.cycle_count_class || '',
      preferred_warehouse_id: editingProduct.preferred_warehouse_id || '',
      track_inventory: Number(editingProduct.track_inventory) === 1,
      is_saleable: Number(editingProduct.is_saleable) === 1,
      is_purchaseable: Number(editingProduct.is_purchaseable) === 1,
      is_active: Number(editingProduct.is_active) === 1,
      inventory_tracking_type: editingProduct.inventory_tracking_type || 'NONE',
      is_bin_managed: Number(editingProduct.is_bin_managed) === 1,
      is_expiry_tracked: Number(editingProduct.is_expiry_tracked) === 1,
      picking_strategy: editingProduct.picking_strategy || 'FIFO',
      is_lot_tracked: Number(editingProduct.is_lot_tracked) === 1,
      is_serial_tracked: Number(editingProduct.is_serial_tracked) === 1,
      serial_number_profile: editingProduct.serial_number_profile || '',
      lot_number_profile: editingProduct.lot_number_profile || '',
      quality_inspection_required: Number(editingProduct.quality_inspection_required) === 1,
      batch_management_enabled: Number(editingProduct.batch_management_enabled) === 1,
      returnable_item: Number(editingProduct.returnable_item) === 1,
      tax_code: editingProduct.tax_code || '',
      tax_category_code: editingProduct.tax_category_code || '',
      input_tax_code: editingProduct.input_tax_code || '',
      output_tax_code: editingProduct.output_tax_code || '',
      country_of_origin: editingProduct.country_of_origin || '',
      hs_code: editingProduct.hs_code || '',
      manufacturer_name: editingProduct.manufacturer_name || '',
      manufacturer_part_number: editingProduct.manufacturer_part_number || '',
      revenue_account_code: editingProduct.revenue_account_code || '',
      inventory_account_code: editingProduct.inventory_account_code || '',
      cogs_account_code: editingProduct.cogs_account_code || '',
      expense_account_code: editingProduct.expense_account_code || '',
      net_weight: String(editingProduct.net_weight ?? 0),
      gross_weight: String(editingProduct.gross_weight ?? 0),
      weight_uom: editingProduct.weight_uom || 'KG',
      length_value: String(editingProduct.length_value ?? 0),
      width_value: String(editingProduct.width_value ?? 0),
      height_value: String(editingProduct.height_value ?? 0),
      dimension_uom: editingProduct.dimension_uom || 'CM',
      image_url: editingProduct.image_url || '',
      notes: editingProduct.notes || '',
      variant_group: editingProduct.variant_group || '',
      parent_product_id: editingProduct.parent_product_id || '',
      variant_code: editingProduct.variant_code || '',
      is_variant_parent: Number(editingProduct.is_variant_parent) === 1,
      is_variant: Number(editingProduct.is_variant) === 1,
      variant_attributes: prettyJson(editingProduct.variant_attributes, []),
      alternate_uoms: prettyJson(editingProduct.alternate_uoms, []),
      vendor_item_mappings: prettyJson(editingProduct.vendor_item_mappings, []),
      sales_defaults: prettyJson(editingProduct.sales_defaults, {}),
      purchasing_defaults: prettyJson(editingProduct.purchasing_defaults, {}),
      mrp_defaults: prettyJson(editingProduct.mrp_defaults, {}),
      quality_defaults: prettyJson(editingProduct.quality_defaults, {}),
      accounting_defaults: prettyJson(editingProduct.accounting_defaults, {}),
      tax_metadata: prettyJson(editingProduct.tax_metadata, {}),
      compliance_metadata: prettyJson(editingProduct.compliance_metadata, {}),
    });
  }, [editingProduct]);

  const isInventoryItem = useMemo(() => formData.item_type === 'Inventory', [formData.item_type]);
  const parentOptions = useMemo(
    () => parentProducts.filter((item) => item.id !== editingProduct?.id),
    [parentProducts, editingProduct]
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
        batch_management_enabled: false,
        quality_inspection_required: false,
        valuation_method: 'STANDARD',
        planning_strategy: 'MANUAL',
      }));
    }
  }, [isInventoryItem]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === 'checkbox' ? checked : value;

    setFormData((prev) => {
      const next = { ...prev, [name]: nextValue };

      if (name === 'base_uom_code' && prev.conversion_mode === 'SINGLE_BASE') {
        next.sales_uom_code = value || 'PCS';
        next.purchase_uom_code = value || 'PCS';
        next.issue_uom_code = value || 'PCS';
      }

      if (name === 'conversion_mode' && value === 'SINGLE_BASE') {
        next.sales_uom_code = prev.base_uom_code || 'PCS';
        next.purchase_uom_code = prev.base_uom_code || 'PCS';
        next.issue_uom_code = prev.base_uom_code || 'PCS';
      }

      if (name === 'inventory_tracking_type') {
        next.is_lot_tracked = value === 'LOT';
        next.is_serial_tracked = value === 'SERIAL';
        next.batch_management_enabled = value === 'LOT';
      }

      if (name === 'item_type' && value !== 'Inventory') {
        next.track_inventory = false;
        next.inventory_tracking_type = 'NONE';
        next.is_lot_tracked = false;
        next.is_serial_tracked = false;
        next.is_expiry_tracked = false;
        next.batch_management_enabled = false;
        next.quality_inspection_required = false;
        next.valuation_method = 'STANDARD';
        next.planning_strategy = 'MANUAL';
      }

      if (name === 'is_variant' && !checked) {
        next.parent_product_id = '';
        next.variant_code = '';
      }

      return next;
    });
  };

  const resetForm = () => setFormData(getInitialFormData());

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

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#4d3188] sm:text-xl">
            {editingProduct ? 'Edit SAP-Level Item Master' : 'Add SAP-Level Item Master'}
          </h2>
          <p className="mt-1 text-sm text-[#7c7494]">
            Governance, multi-UOM, MRP, tax, quality, variant, and accounting configuration in one material master.
          </p>
        </div>

        {editingProduct && (
          <PermissionGate permission="products.update">
            <AppButton type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </AppButton>
          </PermissionGate>
        )}
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <h3 className={sectionTitleClass}>Basic Identification</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <input type="text" name="name" placeholder="Item Name" value={formData.name} onChange={handleChange} className={inputClass} required />
            <input type="text" name="sku" placeholder="SKU / Material Code" value={formData.sku} onChange={handleChange} className={inputClass} required />
            <input type="text" name="barcode" placeholder="Barcode / EAN / UPC" value={formData.barcode} onChange={handleChange} className={inputClass} />
            <select name="category_id" value={formData.category_id} onChange={handleChange} className={inputClass}>
              <option value="">Select Category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select name="item_type" value={formData.item_type} onChange={handleChange} className={inputClass}>
              {enums.itemTypes.map((itemType) => <option key={itemType} value={itemType}>{itemType}</option>)}
            </select>
            <select name="item_status" value={formData.item_status} onChange={handleChange} className={inputClass}>
              {enums.itemStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <input type="text" name="lifecycle_stage" placeholder="Lifecycle Stage" value={formData.lifecycle_stage} onChange={handleChange} className={inputClass} />
            <input type="text" name="material_type" placeholder="Material Type" value={formData.material_type} onChange={handleChange} className={inputClass} />
            <input type="text" name="product_group" placeholder="Product Group" value={formData.product_group} onChange={handleChange} className={inputClass} />
            <input type="text" name="brand" placeholder="Brand" value={formData.brand} onChange={handleChange} className={inputClass} />
            <input type="text" name="manufacturer_name" placeholder="Manufacturer Name" value={formData.manufacturer_name} onChange={handleChange} className={inputClass} />
            <input type="text" name="manufacturer_part_number" placeholder="Manufacturer Part Number" value={formData.manufacturer_part_number} onChange={handleChange} className={inputClass} />
            <input type="text" name="image_url" placeholder="Image URL (public only)" value={formData.image_url} onChange={handleChange} className={`${inputClass} md:col-span-2`} />
            <textarea name="description" placeholder="Description" value={formData.description} onChange={handleChange} className={`${inputClass} md:col-span-2 2xl:col-span-4`} rows={3} />
          </div>
        </div>

        <div>
          <h3 className={sectionTitleClass}>UOM and Conversion</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
            <input type="text" name="base_uom_code" placeholder="Base UOM" value={formData.base_uom_code} onChange={handleChange} className={inputClass} required />
            <input type="text" name="sales_uom_code" placeholder="Sales UOM" value={formData.sales_uom_code} onChange={handleChange} className={inputClass} />
            <input type="text" name="purchase_uom_code" placeholder="Purchase UOM" value={formData.purchase_uom_code} onChange={handleChange} className={inputClass} />
            <input type="text" name="issue_uom_code" placeholder="Issue UOM" value={formData.issue_uom_code} onChange={handleChange} className={inputClass} />
            <select name="conversion_mode" value={formData.conversion_mode} onChange={handleChange} className={inputClass}>
              {enums.conversionModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </div>
          <div className="mt-4">
            <JsonField
              label="Alternate UOM Conversions"
              name="alternate_uoms"
              value={formData.alternate_uoms}
              onChange={handleChange}
              helper='Example: [{"uom_code":"BOX","conversion_factor":12,"is_purchase_uom":true}]'
            />
          </div>
        </div>

        <div>
          <h3 className={sectionTitleClass}>Pricing, Costing, and Planning</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
            <input type="number" step="0.0001" name="base_price" placeholder="Base Price" value={formData.base_price} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="market_price" placeholder="Market Price" value={formData.market_price} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="standard_cost" placeholder="Standard Cost" value={formData.standard_cost} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="selling_price" placeholder="Selling Price" value={formData.selling_price} onChange={handleChange} className={inputClass} />
            <select name="valuation_method" value={formData.valuation_method} onChange={handleChange} className={inputClass}>
              {enums.valuationMethods.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
            <select name="procurement_type" value={formData.procurement_type} onChange={handleChange} className={inputClass}>
              {enums.procurementTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select name="planning_strategy" value={formData.planning_strategy} onChange={handleChange} className={inputClass}>
              {enums.planningStrategies.map((strategy) => <option key={strategy} value={strategy}>{strategy}</option>)}
            </select>
            <input type="number" step="0.0001" name="reorder_point" placeholder="Reorder Point" value={formData.reorder_point} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="min_stock_level" placeholder="Min Stock Level" value={formData.min_stock_level} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="max_stock_level" placeholder="Max Stock Level" value={formData.max_stock_level} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="safety_stock" placeholder="Safety Stock" value={formData.safety_stock} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="min_order_qty" placeholder="Min Order Qty" value={formData.min_order_qty} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="max_order_qty" placeholder="Max Order Qty" value={formData.max_order_qty} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="fixed_lot_size" placeholder="Fixed Lot Size" value={formData.fixed_lot_size} onChange={handleChange} className={inputClass} />
            <input type="number" name="lead_time_days" placeholder="Lead Time Days" value={formData.lead_time_days} onChange={handleChange} className={inputClass} />
            <input type="number" name="shelf_life_days" placeholder="Shelf Life Days" value={formData.shelf_life_days} onChange={handleChange} className={inputClass} />
            <select name="abc_class" value={formData.abc_class} onChange={handleChange} className={inputClass}>
              <option value="">ABC Class</option>
              {enums.abcClasses.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <input type="text" name="cycle_count_class" placeholder="Cycle Count Class" value={formData.cycle_count_class} onChange={handleChange} className={inputClass} />
            <select name="preferred_warehouse_id" value={formData.preferred_warehouse_id} onChange={handleChange} className={inputClass}>
              <option value="">Preferred Warehouse</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.code})</option>)}
            </select>
          </div>
        </div>

        <div>
          <h3 className={sectionTitleClass}>Inventory and Quality Controls</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <select name="inventory_tracking_type" value={formData.inventory_tracking_type} onChange={handleChange} className={inputClass} disabled={!isInventoryItem || !formData.track_inventory}>
              {enums.inventoryTrackingTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select name="picking_strategy" value={formData.picking_strategy} onChange={handleChange} className={inputClass} disabled={!isInventoryItem || !formData.track_inventory}>
              {enums.pickingStrategies.map((strategy) => <option key={strategy} value={strategy}>{strategy}</option>)}
            </select>
            <input type="text" name="serial_number_profile" placeholder="Serial Number Profile" value={formData.serial_number_profile} onChange={handleChange} className={inputClass} />
            <input type="text" name="lot_number_profile" placeholder="Lot Number Profile" value={formData.lot_number_profile} onChange={handleChange} className={inputClass} />
            <label className={checkboxLabelClass}><input type="checkbox" name="track_inventory" checked={formData.track_inventory} onChange={handleChange} disabled={!isInventoryItem} /> Track Inventory</label>
            <label className={checkboxLabelClass}><input type="checkbox" name="is_bin_managed" checked={formData.is_bin_managed} onChange={handleChange} disabled={!isInventoryItem || !formData.track_inventory} /> Bin Managed</label>
            <label className={checkboxLabelClass}><input type="checkbox" name="is_expiry_tracked" checked={formData.is_expiry_tracked} onChange={handleChange} disabled={!isInventoryItem || !formData.track_inventory} /> Expiry Tracked</label>
            <label className={checkboxLabelClass}><input type="checkbox" name="quality_inspection_required" checked={formData.quality_inspection_required} onChange={handleChange} disabled={!isInventoryItem || !formData.track_inventory} /> Quality Inspection Required</label>
            <label className={checkboxLabelClass}><input type="checkbox" name="batch_management_enabled" checked={formData.batch_management_enabled} onChange={handleChange} disabled={!isInventoryItem || !formData.track_inventory} /> Batch Management Enabled</label>
            <label className={checkboxLabelClass}><input type="checkbox" name="is_lot_tracked" checked={formData.is_lot_tracked} onChange={handleChange} disabled /> Lot Tracked</label>
            <label className={checkboxLabelClass}><input type="checkbox" name="is_serial_tracked" checked={formData.is_serial_tracked} onChange={handleChange} disabled /> Serial Tracked</label>
            <label className={checkboxLabelClass}><input type="checkbox" name="returnable_item" checked={formData.returnable_item} onChange={handleChange} /> Returnable Item</label>
          </div>
        </div>

        <div>
          <h3 className={sectionTitleClass}>Sales, Purchasing, and Governance Flags</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <label className={checkboxLabelClass}><input type="checkbox" name="is_saleable" checked={formData.is_saleable} onChange={handleChange} /> Saleable</label>
            <label className={checkboxLabelClass}><input type="checkbox" name="is_purchaseable" checked={formData.is_purchaseable} onChange={handleChange} /> Purchaseable</label>
            <label className={checkboxLabelClass}><input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleChange} /> Active</label>
            <label className={checkboxLabelClass}><input type="checkbox" name="is_variant_parent" checked={formData.is_variant_parent} onChange={handleChange} /> Variant Parent</label>
            <label className={checkboxLabelClass}><input type="checkbox" name="is_variant" checked={formData.is_variant} onChange={handleChange} /> Variant Item</label>
          </div>
        </div>

        <div>
          <h3 className={sectionTitleClass}>Variant and Classification</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <input type="text" name="variant_group" placeholder="Variant Group" value={formData.variant_group} onChange={handleChange} className={inputClass} />
            <select name="parent_product_id" value={formData.parent_product_id} onChange={handleChange} className={inputClass} disabled={!formData.is_variant}>
              <option value="">Select Parent Product</option>
              {parentOptions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}
            </select>
            <input type="text" name="variant_code" placeholder="Variant Code" value={formData.variant_code} onChange={handleChange} className={inputClass} disabled={!formData.is_variant} />
            <input type="text" name="country_of_origin" placeholder="Country of Origin" value={formData.country_of_origin} onChange={handleChange} className={inputClass} />
            <input type="text" name="hs_code" placeholder="HS Code" value={formData.hs_code} onChange={handleChange} className={inputClass} />
          </div>
          <div className="mt-4">
            <JsonField
              label="Variant Attributes"
              name="variant_attributes"
              value={formData.variant_attributes}
              onChange={handleChange}
              helper='Example: [{"attribute":"Color","value":"Black"},{"attribute":"Size","value":"L"}]'
            />
          </div>
        </div>

        <div>
          <h3 className={sectionTitleClass}>Tax and Accounting</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <input type="text" name="tax_code" placeholder="Legacy Tax Code" value={formData.tax_code} onChange={handleChange} className={inputClass} />
            <input type="text" name="tax_category_code" placeholder="Tax Category Code" value={formData.tax_category_code} onChange={handleChange} className={inputClass} />
            <input type="text" name="input_tax_code" placeholder="Input Tax Code" value={formData.input_tax_code} onChange={handleChange} className={inputClass} />
            <input type="text" name="output_tax_code" placeholder="Output Tax Code" value={formData.output_tax_code} onChange={handleChange} className={inputClass} />
            <input type="text" name="revenue_account_code" placeholder="Revenue Account Code" value={formData.revenue_account_code} onChange={handleChange} className={inputClass} />
            <input type="text" name="inventory_account_code" placeholder="Inventory Account Code" value={formData.inventory_account_code} onChange={handleChange} className={inputClass} />
            <input type="text" name="cogs_account_code" placeholder="COGS Account Code" value={formData.cogs_account_code} onChange={handleChange} className={inputClass} />
            <input type="text" name="expense_account_code" placeholder="Expense Account Code" value={formData.expense_account_code} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        <div>
          <h3 className={sectionTitleClass}>Logistics and Dimensions</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-5">
            <input type="number" step="0.0001" name="net_weight" placeholder="Net Weight" value={formData.net_weight} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="gross_weight" placeholder="Gross Weight" value={formData.gross_weight} onChange={handleChange} className={inputClass} />
            <input type="text" name="weight_uom" placeholder="Weight UOM" value={formData.weight_uom} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="length_value" placeholder="Length" value={formData.length_value} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="width_value" placeholder="Width" value={formData.width_value} onChange={handleChange} className={inputClass} />
            <input type="number" step="0.0001" name="height_value" placeholder="Height" value={formData.height_value} onChange={handleChange} className={inputClass} />
            <input type="text" name="dimension_uom" placeholder="Dimension UOM" value={formData.dimension_uom} onChange={handleChange} className={inputClass} />
          </div>
        </div>

        <div>
          <h3 className={sectionTitleClass}>JSON Defaults and Advanced Structures</h3>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <JsonField label="Vendor Item Mappings" name="vendor_item_mappings" value={formData.vendor_item_mappings} onChange={handleChange} helper='Example: [{"supplier_id":1,"vendor_sku":"ABC-123","purchase_uom":"BOX"}]' />
            <JsonField label="Sales Defaults" name="sales_defaults" value={formData.sales_defaults} onChange={handleChange} helper='Example: {"default_discount_group":"STD","allow_backorder":false}' />
            <JsonField label="Purchasing Defaults" name="purchasing_defaults" value={formData.purchasing_defaults} onChange={handleChange} helper='Example: {"gr_processing_time_days":2,"preferred_supplier_id":1}' />
            <JsonField label="MRP Defaults" name="mrp_defaults" value={formData.mrp_defaults} onChange={handleChange} helper='Example: {"planner_code":"PLN-01","mrp_controller":"MAIN"}' />
            <JsonField label="Quality Defaults" name="quality_defaults" value={formData.quality_defaults} onChange={handleChange} helper='Example: {"inspection_type":"incoming","sampling_code":"STD"}' />
            <JsonField label="Accounting Defaults" name="accounting_defaults" value={formData.accounting_defaults} onChange={handleChange} helper='Example: {"valuation_class":"3000","posting_profile":"FG"}' />
            <JsonField label="Tax Metadata" name="tax_metadata" value={formData.tax_metadata} onChange={handleChange} helper='Example: {"vat_rate":12,"classification":"VATABLE"}' />
            <JsonField label="Compliance Metadata" name="compliance_metadata" value={formData.compliance_metadata} onChange={handleChange} helper='Example: {"regulated":false,"document_requirements":[]}' />
          </div>
        </div>

        <div>
          <h3 className={sectionTitleClass}>Notes</h3>
          <textarea name="notes" placeholder="Internal notes" value={formData.notes} onChange={handleChange} className={`${inputClass} w-full`} rows={4} />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
        {editingProduct ? (
          <PermissionGate permission="products.update">
            <AppButton type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Update Item Master'}
            </AppButton>
          </PermissionGate>
        ) : (
          <PermissionGate permission="products.create">
            <AppButton type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Create Item Master'}
            </AppButton>
          </PermissionGate>
        )}
      </div>
    </form>
  );
}
