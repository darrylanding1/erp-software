import db from '../config/db.js';
import { createAuditLog, getRequestIp } from '../utils/auditTrail.js';
import {
  getProductStockSummaryQuery,
  initializeProductInventoryRows,
  syncProductInventorySummary,
} from '../utils/inventoryStock.js';
import {
  buildScopeWhereClause,
  requireDataScope,
} from '../middleware/dataScopeMiddleware.js';

const stockStatusSql = `
  CASE
    WHEN COALESCE(stock.total_quantity, 0) <= 0 THEN 'Out of Stock'
    WHEN COALESCE(stock.total_quantity, 0) <= COALESCE(NULLIF(p.reorder_point, 0), 10) THEN 'Low Stock'
    ELSE 'In Stock'
  END
`;

const enumSets = {
  itemTypes: ['Inventory', 'Service', 'Non-Inventory'],
  inventoryTrackingTypes: ['NONE', 'LOT', 'SERIAL'],
  pickingStrategies: ['MANUAL', 'FIFO', 'FEFO'],
  itemStatuses: ['DRAFT', 'ACTIVE', 'BLOCKED', 'DISCONTINUED'],
  valuationMethods: ['STANDARD', 'MOVING_AVERAGE', 'FIFO'],
  procurementTypes: ['BUY', 'MAKE', 'BOTH'],
  planningStrategies: ['MANUAL', 'REORDER_POINT', 'MIN_MAX', 'MRP'],
  conversionModes: ['SINGLE_BASE', 'MULTI_UOM'],
  abcClasses: ['A', 'B', 'C'],
  statuses: ['In Stock', 'Low Stock', 'Out of Stock'],
};

const text = (value, fallback = null) => {
  if (value === undefined || value === null) return fallback;
  const cleaned = String(value).trim();
  return cleaned || fallback;
};

const numberValue = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nullableNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const integerValue = (value, fallback = 0) => Math.trunc(numberValue(value, fallback));

const boolValue = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const sanitizeImageUrl = (value) => {
  const cleaned = text(value);
  if (!cleaned) return null;

  const lowered = cleaned.toLowerCase();
  if (lowered.includes('localhost') || lowered.includes('127.0.0.1')) {
    return null;
  }

  return cleaned;
};

const normalizeJsonInput = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return JSON.stringify(fallback);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || JSON.stringify(fallback);
  }

  return JSON.stringify(value);
};

const parseJsonSafe = (value, fallback) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const getProductScopeClause = (scope, alias = 'p') =>
  buildScopeWhereClause(scope, {
    company: `${alias}.company_id`,
    branch: `${alias}.branch_id`,
    businessUnit: `${alias}.business_unit_id`,
  });

const mapScopeInsert = (scope) => ({
  company_id: scope?.company_id ?? null,
  branch_id: scope?.branch_id ?? null,
  business_unit_id: scope?.business_unit_id ?? null,
});

const normalizeTrackingFlags = (payload) => {
  const next = { ...payload };

  if (next.item_type !== 'Inventory' || !next.track_inventory) {
    next.inventory_tracking_type = 'NONE';
    next.is_lot_tracked = false;
    next.is_serial_tracked = false;
    next.is_expiry_tracked = false;
    next.batch_management_enabled = false;
    next.quality_inspection_required = false;
    return next;
  }

  if (next.inventory_tracking_type === 'LOT') {
    next.is_lot_tracked = true;
    next.is_serial_tracked = false;
    next.batch_management_enabled = true;
  } else if (next.inventory_tracking_type === 'SERIAL') {
    next.is_serial_tracked = true;
    next.is_lot_tracked = false;
    next.batch_management_enabled = false;
  } else {
    next.is_serial_tracked = false;
    next.is_lot_tracked = false;
    next.batch_management_enabled = false;
  }

  if (next.picking_strategy === 'FEFO' && !next.is_expiry_tracked) {
    next.picking_strategy = 'FIFO';
  }

  if (next.item_type !== 'Inventory') {
    next.valuation_method = 'STANDARD';
    next.planning_strategy = 'MANUAL';
  }

  if (next.base_uom_code && !next.sales_uom_code) next.sales_uom_code = next.base_uom_code;
  if (next.base_uom_code && !next.purchase_uom_code) next.purchase_uom_code = next.base_uom_code;
  if (next.base_uom_code && !next.issue_uom_code) next.issue_uom_code = next.base_uom_code;

  return next;
};

const shapeProductRow = (row) => {
  if (!row) return null;

  return {
    ...row,
    image_url: sanitizeImageUrl(row.image_url),
    variant_attributes: parseJsonSafe(row.variant_attributes_json, []),
    alternate_uoms: parseJsonSafe(row.alternate_uoms_json, []),
    vendor_item_mappings: parseJsonSafe(row.vendor_item_mappings_json, []),
    sales_defaults: parseJsonSafe(row.sales_defaults_json, {}),
    purchasing_defaults: parseJsonSafe(row.purchasing_defaults_json, {}),
    mrp_defaults: parseJsonSafe(row.mrp_defaults_json, {}),
    quality_defaults: parseJsonSafe(row.quality_defaults_json, {}),
    accounting_defaults: parseJsonSafe(row.accounting_defaults_json, {}),
    tax_metadata: parseJsonSafe(row.tax_metadata_json, {}),
    compliance_metadata: parseJsonSafe(row.compliance_metadata_json, {}),
  };
};

const productSelectSql = `
  SELECT
    p.id,
    p.name,
    p.description,
    p.sku,
    p.category_id,
    p.item_type,
    p.item_status,
    p.lifecycle_stage,
    p.material_type,
    p.product_group,
    p.brand,
    p.uom,
    p.base_uom_code,
    p.sales_uom_code,
    p.purchase_uom_code,
    p.issue_uom_code,
    p.conversion_mode,
    p.barcode,
    p.base_price,
    p.market_price,
    p.standard_cost,
    p.selling_price,
    p.valuation_method,
    p.procurement_type,
    p.planning_strategy,
    p.reorder_point,
    p.min_stock_level,
    p.max_stock_level,
    p.safety_stock,
    p.min_order_qty,
    p.max_order_qty,
    p.fixed_lot_size,
    p.lead_time_days,
    p.shelf_life_days,
    p.abc_class,
    p.cycle_count_class,
    p.preferred_warehouse_id,
    pw.name AS preferred_warehouse_name,
    p.track_inventory,
    p.is_saleable,
    p.is_purchaseable,
    p.is_active,
    p.tax_code,
    p.tax_category_code,
    p.input_tax_code,
    p.output_tax_code,
    p.country_of_origin,
    p.hs_code,
    p.manufacturer_name,
    p.manufacturer_part_number,
    p.revenue_account_code,
    p.inventory_account_code,
    p.cogs_account_code,
    p.expense_account_code,
    p.notes,
    p.image_url,
    p.variant_group,
    p.parent_product_id,
    p.variant_code,
    p.is_variant_parent,
    p.is_variant,
    p.variant_attributes_json,
    p.alternate_uoms_json,
    p.vendor_item_mappings_json,
    p.sales_defaults_json,
    p.purchasing_defaults_json,
    p.mrp_defaults_json,
    p.quality_defaults_json,
    p.accounting_defaults_json,
    p.tax_metadata_json,
    p.compliance_metadata_json,
    p.created_at,
    p.updated_at,
    p.inventory_tracking_type,
    p.is_bin_managed,
    p.is_expiry_tracked,
    p.picking_strategy,
    p.is_lot_tracked,
    p.is_serial_tracked,
    p.serial_number_profile,
    p.lot_number_profile,
    p.quality_inspection_required,
    p.batch_management_enabled,
    p.returnable_item,
    p.net_weight,
    p.gross_weight,
    p.weight_uom,
    p.length_value,
    p.width_value,
    p.height_value,
    p.dimension_uom,
    p.company_id,
    p.branch_id,
    p.business_unit_id,
    c.name AS category_name,
    parent.name AS parent_product_name,
    COALESCE(stock.total_quantity, 0) AS quantity,
    COALESCE(stock.total_reserved_quantity, 0) AS reserved_quantity,
    COALESCE(stock.total_available_quantity, 0) AS available_quantity,
    COALESCE(stock.total_value, 0) AS stock_value,
    ${stockStatusSql} AS status
  FROM products p
  LEFT JOIN categories c
    ON p.category_id = c.id
   AND c.company_id = p.company_id
   AND (c.branch_id <=> p.branch_id)
   AND (c.business_unit_id <=> p.business_unit_id)
  LEFT JOIN warehouses pw
    ON p.preferred_warehouse_id = pw.id
   AND pw.company_id = p.company_id
   AND (pw.branch_id <=> p.branch_id)
   AND (pw.business_unit_id <=> p.business_unit_id)
  LEFT JOIN products parent
    ON p.parent_product_id = parent.id
   AND parent.company_id = p.company_id
   AND (parent.branch_id <=> p.branch_id)
   AND (parent.business_unit_id <=> p.business_unit_id)
  ${getProductStockSummaryQuery()}
`;

const getProductById = async (id, scope) => {
  const productScope = getProductScopeClause(scope, 'p');
  const [rows] = await db.query(
    `${productSelectSql}
     WHERE p.id = ? ${productScope.sql}
     LIMIT 1`,
    [id, ...productScope.values]
  );

  return shapeProductRow(rows[0] || null);
};

const validateJsonPayloads = (payload, errors) => {
  const pairs = [
    ['variant_attributes_json', 'Variant attributes'],
    ['alternate_uoms_json', 'Alternate UOM conversions'],
    ['vendor_item_mappings_json', 'Vendor item mappings'],
    ['sales_defaults_json', 'Sales defaults'],
    ['purchasing_defaults_json', 'Purchasing defaults'],
    ['mrp_defaults_json', 'MRP defaults'],
    ['quality_defaults_json', 'Quality defaults'],
    ['accounting_defaults_json', 'Accounting defaults'],
    ['tax_metadata_json', 'Tax metadata'],
    ['compliance_metadata_json', 'Compliance metadata'],
  ];

  for (const [field, label] of pairs) {
    try {
      JSON.parse(payload[field]);
    } catch {
      errors.push(`${label} must be valid JSON`);
    }
  }
};

const validateAlternateUoms = (payload, errors) => {
  const rows = parseJsonSafe(payload.alternate_uoms_json, []);

  if (!Array.isArray(rows)) {
    errors.push('Alternate UOM conversions must be an array');
    return;
  }

  const base = payload.base_uom_code;
  const seen = new Set();

  for (const row of rows) {
    const uomCode = text(row?.uom_code);
    const factor = Number(row?.conversion_factor);

    if (!uomCode) {
      errors.push('Every alternate UOM row must contain uom_code');
      continue;
    }

    if (uomCode === base) {
      errors.push(`Alternate UOM ${uomCode} cannot be the same as base UOM`);
    }

    if (!Number.isFinite(factor) || factor <= 0) {
      errors.push(`Alternate UOM ${uomCode} must have a conversion_factor greater than 0`);
    }

    if (seen.has(uomCode)) {
      errors.push(`Duplicate alternate UOM ${uomCode} is not allowed`);
    }
    seen.add(uomCode);
  }
};

const validateProductPayload = async ({ productId = null, payload, scope }) => {
  const errors = [];

  if (!payload.name) errors.push('Name is required');
  if (!payload.sku) errors.push('SKU is required');
  if (!payload.base_uom_code) errors.push('Base UOM is required');

  if (!enumSets.itemTypes.includes(payload.item_type)) errors.push('Invalid item type');
  if (!enumSets.itemStatuses.includes(payload.item_status)) errors.push('Invalid item status');
  if (!enumSets.inventoryTrackingTypes.includes(payload.inventory_tracking_type)) {
    errors.push('Invalid inventory tracking type');
  }
  if (!enumSets.pickingStrategies.includes(payload.picking_strategy)) {
    errors.push('Invalid picking strategy');
  }
  if (!enumSets.valuationMethods.includes(payload.valuation_method)) {
    errors.push('Invalid valuation method');
  }
  if (!enumSets.procurementTypes.includes(payload.procurement_type)) {
    errors.push('Invalid procurement type');
  }
  if (!enumSets.planningStrategies.includes(payload.planning_strategy)) {
    errors.push('Invalid planning strategy');
  }
  if (!enumSets.conversionModes.includes(payload.conversion_mode)) {
    errors.push('Invalid conversion mode');
  }
  if (payload.abc_class && !enumSets.abcClasses.includes(payload.abc_class)) {
    errors.push('Invalid ABC class');
  }

  if (payload.min_stock_level > payload.max_stock_level && payload.max_stock_level > 0) {
    errors.push('Min stock level cannot be greater than max stock level');
  }

  if (payload.min_order_qty > payload.max_order_qty && payload.max_order_qty > 0) {
    errors.push('Min order quantity cannot be greater than max order quantity');
  }

  if (payload.picking_strategy === 'FEFO' && !payload.is_expiry_tracked) {
    errors.push('FEFO picking requires expiry tracking');
  }

  if (payload.item_type !== 'Inventory' && payload.track_inventory) {
    errors.push('Only inventory items can track inventory');
  }

  if (payload.inventory_tracking_type === 'LOT' && !payload.is_lot_tracked) {
    errors.push('LOT tracking type must enable lot tracking');
  }

  if (payload.inventory_tracking_type === 'SERIAL' && !payload.is_serial_tracked) {
    errors.push('SERIAL tracking type must enable serial tracking');
  }

  if (payload.is_variant && !payload.parent_product_id) {
    errors.push('A variant item must have a parent product');
  }

  if (payload.parent_product_id && productId && Number(payload.parent_product_id) === Number(productId)) {
    errors.push('A product cannot be its own parent');
  }

  if (payload.category_id) {
    const [[category]] = await db.query(
      `
      SELECT id
      FROM categories
      WHERE id = ?
        AND company_id = ?
        AND (? IS NULL OR branch_id <=> ?)
        AND (? IS NULL OR business_unit_id <=> ?)
      LIMIT 1
      `,
      [
        payload.category_id,
        scope.company_id,
        scope.branch_id,
        scope.branch_id,
        scope.business_unit_id,
        scope.business_unit_id,
      ]
    );

    if (!category) errors.push('Selected category was not found in the active scope');
  }

  if (payload.preferred_warehouse_id) {
    const [[warehouse]] = await db.query(
      `
      SELECT id
      FROM warehouses
      WHERE id = ?
        AND company_id = ?
        AND (? IS NULL OR branch_id <=> ?)
        AND (? IS NULL OR business_unit_id <=> ?)
      LIMIT 1
      `,
      [
        payload.preferred_warehouse_id,
        scope.company_id,
        scope.branch_id,
        scope.branch_id,
        scope.business_unit_id,
        scope.business_unit_id,
      ]
    );

    if (!warehouse) errors.push('Selected preferred warehouse was not found in the active scope');
  }

  if (payload.parent_product_id) {
    const [[parent]] = await db.query(
      `
      SELECT id, is_variant
      FROM products
      WHERE id = ?
        AND company_id = ?
        AND (? IS NULL OR branch_id <=> ?)
        AND (? IS NULL OR business_unit_id <=> ?)
      LIMIT 1
      `,
      [
        payload.parent_product_id,
        scope.company_id,
        scope.branch_id,
        scope.branch_id,
        scope.business_unit_id,
        scope.business_unit_id,
      ]
    );

    if (!parent) {
      errors.push('Selected parent product was not found in the active scope');
    } else if (Number(parent.is_variant) === 1) {
      errors.push('A variant cannot be used as a parent product');
    }
  }

  validateJsonPayloads(payload, errors);
  validateAlternateUoms(payload, errors);

  if (productId) {
    const [[stockRow]] = await db.query(
      `
      SELECT COALESCE(SUM(quantity), 0) AS total_quantity
      FROM inventory_stocks
      WHERE product_id = ?
        AND company_id = ?
        AND (? IS NULL OR branch_id <=> ?)
        AND (? IS NULL OR business_unit_id <=> ?)
      `,
      [
        productId,
        scope.company_id,
        scope.branch_id,
        scope.branch_id,
        scope.business_unit_id,
        scope.business_unit_id,
      ]
    );

    const hasStock = Number(stockRow?.total_quantity || 0) > 0;

    if (hasStock && payload.item_type !== 'Inventory') {
      errors.push('Cannot change item type to non-inventory while stock exists');
    }

    if (hasStock && !payload.track_inventory) {
      errors.push('Cannot disable inventory tracking while stock exists');
    }
  }

  return errors;
};

const mapRequestToProductPayload = (req) => {
  const body = req.body || {};
  const itemType = text(body.item_type, 'Inventory');
  const trackInventory = itemType === 'Inventory' ? boolValue(body.track_inventory, true) : false;
  const baseUomCode = text(body.base_uom_code) || text(body.uom) || 'PCS';

  return normalizeTrackingFlags({
    name: text(body.name),
    description: text(body.description),
    sku: text(body.sku),
    category_id: nullableNumber(body.category_id),
    item_type: itemType,
    item_status: text(body.item_status, 'ACTIVE'),
    lifecycle_stage: text(body.lifecycle_stage),
    material_type: text(body.material_type),
    product_group: text(body.product_group),
    brand: text(body.brand),
    uom: baseUomCode,
    base_uom_code: baseUomCode,
    sales_uom_code: text(body.sales_uom_code) || baseUomCode,
    purchase_uom_code: text(body.purchase_uom_code) || baseUomCode,
    issue_uom_code: text(body.issue_uom_code) || baseUomCode,
    conversion_mode: text(body.conversion_mode, 'SINGLE_BASE'),
    barcode: text(body.barcode),
    base_price: numberValue(body.base_price, 0),
    market_price: numberValue(body.market_price, 0),
    standard_cost: numberValue(body.standard_cost, numberValue(body.base_price, 0)),
    selling_price: numberValue(body.selling_price, numberValue(body.market_price, 0)),
    valuation_method: text(body.valuation_method, 'MOVING_AVERAGE'),
    procurement_type: text(body.procurement_type, 'BUY'),
    planning_strategy: text(body.planning_strategy, 'REORDER_POINT'),
    reorder_point: numberValue(body.reorder_point, 0),
    min_stock_level: numberValue(body.min_stock_level, 0),
    max_stock_level: numberValue(body.max_stock_level, 0),
    safety_stock: numberValue(body.safety_stock, 0),
    min_order_qty: numberValue(body.min_order_qty, 0),
    max_order_qty: numberValue(body.max_order_qty, 0),
    fixed_lot_size: numberValue(body.fixed_lot_size, 0),
    lead_time_days: integerValue(body.lead_time_days, 0),
    shelf_life_days: integerValue(body.shelf_life_days, 0),
    abc_class: text(body.abc_class),
    cycle_count_class: text(body.cycle_count_class),
    preferred_warehouse_id: nullableNumber(body.preferred_warehouse_id),
    track_inventory: trackInventory,
    is_saleable: boolValue(body.is_saleable, true),
    is_purchaseable: boolValue(body.is_purchaseable, true),
    is_active: boolValue(body.is_active, true),
    tax_code: text(body.tax_code),
    tax_category_code: text(body.tax_category_code),
    input_tax_code: text(body.input_tax_code),
    output_tax_code: text(body.output_tax_code),
    country_of_origin: text(body.country_of_origin),
    hs_code: text(body.hs_code),
    manufacturer_name: text(body.manufacturer_name),
    manufacturer_part_number: text(body.manufacturer_part_number),
    revenue_account_code: text(body.revenue_account_code),
    inventory_account_code: text(body.inventory_account_code),
    cogs_account_code: text(body.cogs_account_code),
    expense_account_code: text(body.expense_account_code),
    notes: text(body.notes),
    image_url: sanitizeImageUrl(body.image_url),
    inventory_tracking_type: text(body.inventory_tracking_type, 'NONE'),
    is_bin_managed: boolValue(body.is_bin_managed, true),
    is_expiry_tracked: boolValue(body.is_expiry_tracked, false),
    picking_strategy: text(body.picking_strategy, 'FIFO'),
    is_lot_tracked: boolValue(body.is_lot_tracked, false),
    is_serial_tracked: boolValue(body.is_serial_tracked, false),
    serial_number_profile: text(body.serial_number_profile),
    lot_number_profile: text(body.lot_number_profile),
    quality_inspection_required: boolValue(body.quality_inspection_required, false),
    batch_management_enabled: boolValue(body.batch_management_enabled, false),
    returnable_item: boolValue(body.returnable_item, false),
    net_weight: numberValue(body.net_weight, 0),
    gross_weight: numberValue(body.gross_weight, 0),
    weight_uom: text(body.weight_uom, 'KG'),
    length_value: numberValue(body.length_value, 0),
    width_value: numberValue(body.width_value, 0),
    height_value: numberValue(body.height_value, 0),
    dimension_uom: text(body.dimension_uom, 'CM'),
    variant_group: text(body.variant_group),
    parent_product_id: nullableNumber(body.parent_product_id),
    variant_code: text(body.variant_code),
    is_variant_parent: boolValue(body.is_variant_parent, false),
    is_variant: boolValue(body.is_variant, false),
    variant_attributes_json: normalizeJsonInput(body.variant_attributes, []),
    alternate_uoms_json: normalizeJsonInput(body.alternate_uoms, []),
    vendor_item_mappings_json: normalizeJsonInput(body.vendor_item_mappings, []),
    sales_defaults_json: normalizeJsonInput(body.sales_defaults, {}),
    purchasing_defaults_json: normalizeJsonInput(body.purchasing_defaults, {}),
    mrp_defaults_json: normalizeJsonInput(body.mrp_defaults, {}),
    quality_defaults_json: normalizeJsonInput(body.quality_defaults, {}),
    accounting_defaults_json: normalizeJsonInput(body.accounting_defaults, {}),
    tax_metadata_json: normalizeJsonInput(body.tax_metadata, {}),
    compliance_metadata_json: normalizeJsonInput(body.compliance_metadata, {}),
  });
};

export const getProductMeta = async (req, res) => {
  try {
    const scope = requireDataScope(req);

    const categoryScope = buildScopeWhereClause(scope, {
      company: 'c.company_id',
      branch: 'c.branch_id',
      businessUnit: 'c.business_unit_id',
    });

    const warehouseScope = buildScopeWhereClause(scope, {
      company: 'w.company_id',
      branch: 'w.branch_id',
      businessUnit: 'w.business_unit_id',
    });

    const productScope = getProductScopeClause(scope, 'p');

    const [categories] = await db.query(
      `
      SELECT c.id, c.name
      FROM categories c
      WHERE 1 = 1 ${categoryScope.sql}
      ORDER BY c.name ASC
      `,
      categoryScope.values
    );

    const [warehouses] = await db.query(
      `
      SELECT w.id, w.name, w.code
      FROM warehouses w
      WHERE w.status = 'Active' ${warehouseScope.sql}
      ORDER BY w.name ASC
      `,
      warehouseScope.values
    );

    const [parentProducts] = await db.query(
      `
      SELECT p.id, p.name, p.sku, p.variant_group
      FROM products p
      WHERE p.is_variant = 0 ${productScope.sql}
      ORDER BY p.name ASC
      `,
      productScope.values
    );

    res.json({
      categories,
      warehouses,
      parentProducts,
      enums: enumSets,
    });
  } catch (error) {
    console.error('Get product meta error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch product meta' });
  }
};

export const getProducts = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      search = '',
      category_id = '',
      status = '',
      item_type = '',
      is_active = '',
      track_inventory = '',
      item_status = '',
      valuation_method = '',
      procurement_type = '',
      planning_strategy = '',
      variant_group = '',
    } = req.query;

    const productScope = getProductScopeClause(scope, 'p');
    const values = [...productScope.values];

    let sql = `${productSelectSql}
      WHERE 1 = 1 ${productScope.sql}`;

    if (search) {
      sql += `
        AND (
          p.name LIKE ?
          OR p.sku LIKE ?
          OR p.barcode LIKE ?
          OR p.brand LIKE ?
          OR p.product_group LIKE ?
          OR p.variant_group LIKE ?
          OR p.manufacturer_part_number LIKE ?
        )`;
      values.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      );
    }

    if (category_id) {
      sql += ' AND p.category_id = ?';
      values.push(category_id);
    }
    if (status) {
      sql += ` AND ${stockStatusSql} = ?`;
      values.push(status);
    }
    if (item_type) {
      sql += ' AND p.item_type = ?';
      values.push(item_type);
    }
    if (item_status) {
      sql += ' AND p.item_status = ?';
      values.push(item_status);
    }
    if (valuation_method) {
      sql += ' AND p.valuation_method = ?';
      values.push(valuation_method);
    }
    if (procurement_type) {
      sql += ' AND p.procurement_type = ?';
      values.push(procurement_type);
    }
    if (planning_strategy) {
      sql += ' AND p.planning_strategy = ?';
      values.push(planning_strategy);
    }
    if (variant_group) {
      sql += ' AND p.variant_group = ?';
      values.push(variant_group);
    }
    if (is_active !== '') {
      sql += ' AND p.is_active = ?';
      values.push(boolValue(is_active, true) ? 1 : 0);
    }
    if (track_inventory !== '') {
      sql += ' AND p.track_inventory = ?';
      values.push(boolValue(track_inventory, false) ? 1 : 0);
    }

    sql += ' ORDER BY p.id DESC';

    const [rows] = await db.query(sql, values);
    res.json(rows.map(shapeProductRow));
  } catch (error) {
    console.error('Get products error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch products' });
  }
};

export const createProduct = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const scope = requireDataScope(req);
    const scopeInsert = mapScopeInsert(scope);
    const payload = mapRequestToProductPayload(req);
    const errors = await validateProductPayload({ payload, scope });

    if (errors.length > 0) {
      await connection.rollback();
      return res.status(400).json({ message: errors[0] });
    }

    const [result] = await connection.query(
      `
      INSERT INTO products (
        name, description, sku, category_id, item_type, item_status, lifecycle_stage, material_type,
        product_group, brand, uom, base_uom_code, sales_uom_code, purchase_uom_code, issue_uom_code,
        conversion_mode, barcode, base_price, market_price, standard_cost, selling_price, valuation_method,
        procurement_type, planning_strategy, reorder_point, min_stock_level, max_stock_level, safety_stock,
        min_order_qty, max_order_qty, fixed_lot_size, lead_time_days, shelf_life_days, abc_class,
        cycle_count_class, preferred_warehouse_id, track_inventory, is_saleable, is_purchaseable, is_active,
        tax_code, tax_category_code, input_tax_code, output_tax_code, country_of_origin, hs_code,
        manufacturer_name, manufacturer_part_number, revenue_account_code, inventory_account_code,
        cogs_account_code, expense_account_code, notes, image_url, variant_group, parent_product_id,
        variant_code, is_variant_parent, is_variant, variant_attributes_json, alternate_uoms_json,
        vendor_item_mappings_json, sales_defaults_json, purchasing_defaults_json, mrp_defaults_json,
        quality_defaults_json, accounting_defaults_json, tax_metadata_json, compliance_metadata_json,
        quantity, status, inventory_tracking_type, is_bin_managed, is_expiry_tracked, picking_strategy,
        is_lot_tracked, is_serial_tracked, serial_number_profile, lot_number_profile,
        quality_inspection_required, batch_management_enabled, returnable_item, net_weight, gross_weight,
        weight_uom, length_value, width_value, height_value, dimension_uom,
        company_id, branch_id, business_unit_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        0, 'Out of Stock', ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
      `,
      [
        payload.name,
        payload.description,
        payload.sku,
        payload.category_id,
        payload.item_type,
        payload.item_status,
        payload.lifecycle_stage,
        payload.material_type,
        payload.product_group,
        payload.brand,
        payload.uom,
        payload.base_uom_code,
        payload.sales_uom_code,
        payload.purchase_uom_code,
        payload.issue_uom_code,
        payload.conversion_mode,
        payload.barcode,
        payload.base_price,
        payload.market_price,
        payload.standard_cost,
        payload.selling_price,
        payload.valuation_method,
        payload.procurement_type,
        payload.planning_strategy,
        payload.reorder_point,
        payload.min_stock_level,
        payload.max_stock_level,
        payload.safety_stock,
        payload.min_order_qty,
        payload.max_order_qty,
        payload.fixed_lot_size,
        payload.lead_time_days,
        payload.shelf_life_days,
        payload.abc_class,
        payload.cycle_count_class,
        payload.preferred_warehouse_id,
        payload.track_inventory ? 1 : 0,
        payload.is_saleable ? 1 : 0,
        payload.is_purchaseable ? 1 : 0,
        payload.is_active ? 1 : 0,
        payload.tax_code,
        payload.tax_category_code,
        payload.input_tax_code,
        payload.output_tax_code,
        payload.country_of_origin,
        payload.hs_code,
        payload.manufacturer_name,
        payload.manufacturer_part_number,
        payload.revenue_account_code,
        payload.inventory_account_code,
        payload.cogs_account_code,
        payload.expense_account_code,
        payload.notes,
        payload.image_url,
        payload.variant_group,
        payload.parent_product_id,
        payload.variant_code,
        payload.is_variant_parent ? 1 : 0,
        payload.is_variant ? 1 : 0,
        payload.variant_attributes_json,
        payload.alternate_uoms_json,
        payload.vendor_item_mappings_json,
        payload.sales_defaults_json,
        payload.purchasing_defaults_json,
        payload.mrp_defaults_json,
        payload.quality_defaults_json,
        payload.accounting_defaults_json,
        payload.tax_metadata_json,
        payload.compliance_metadata_json,
        payload.inventory_tracking_type,
        payload.is_bin_managed ? 1 : 0,
        payload.is_expiry_tracked ? 1 : 0,
        payload.picking_strategy,
        payload.is_lot_tracked ? 1 : 0,
        payload.is_serial_tracked ? 1 : 0,
        payload.serial_number_profile,
        payload.lot_number_profile,
        payload.quality_inspection_required ? 1 : 0,
        payload.batch_management_enabled ? 1 : 0,
        payload.returnable_item ? 1 : 0,
        payload.net_weight,
        payload.gross_weight,
        payload.weight_uom,
        payload.length_value,
        payload.width_value,
        payload.height_value,
        payload.dimension_uom,
        scopeInsert.company_id,
        scopeInsert.branch_id,
        scopeInsert.business_unit_id,
      ]
    );

    await initializeProductInventoryRows(connection, result.insertId);
    await syncProductInventorySummary(connection, result.insertId);
    await connection.commit();

    const createdProduct = await getProductById(result.insertId, scope);

    await createAuditLog({
      userId: req.user?.id || null,
      action: 'CREATE',
      moduleName: 'Products',
      recordId: createdProduct.id,
      description: `Created SAP-level item master ${createdProduct.name} (${createdProduct.sku})`,
      newValues: createdProduct,
      ipAddress: getRequestIp(req),
    });

    res.status(201).json(createdProduct);
  } catch (error) {
    await connection.rollback();
    console.error('Create product error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      if (String(error.message || '').toLowerCase().includes('barcode')) {
        return res.status(400).json({ message: 'Barcode already exists in the active scope' });
      }
      return res.status(400).json({ message: 'SKU already exists in the active scope' });
    }

    res.status(500).json({ message: 'Failed to create product' });
  } finally {
    connection.release();
  }
};

export const updateProduct = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { id } = req.params;

    const oldProduct = await getProductById(id, scope);
    if (!oldProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const payload = mapRequestToProductPayload(req);
    const errors = await validateProductPayload({ productId: id, payload, scope });

    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0] });
    }

    await db.query(
      `
      UPDATE products
      SET
        name = ?,
        description = ?,
        sku = ?,
        category_id = ?,
        item_type = ?,
        item_status = ?,
        lifecycle_stage = ?,
        material_type = ?,
        product_group = ?,
        brand = ?,
        uom = ?,
        base_uom_code = ?,
        sales_uom_code = ?,
        purchase_uom_code = ?,
        issue_uom_code = ?,
        conversion_mode = ?,
        barcode = ?,
        base_price = ?,
        market_price = ?,
        standard_cost = ?,
        selling_price = ?,
        valuation_method = ?,
        procurement_type = ?,
        planning_strategy = ?,
        reorder_point = ?,
        min_stock_level = ?,
        max_stock_level = ?,
        safety_stock = ?,
        min_order_qty = ?,
        max_order_qty = ?,
        fixed_lot_size = ?,
        lead_time_days = ?,
        shelf_life_days = ?,
        abc_class = ?,
        cycle_count_class = ?,
        preferred_warehouse_id = ?,
        track_inventory = ?,
        is_saleable = ?,
        is_purchaseable = ?,
        is_active = ?,
        tax_code = ?,
        tax_category_code = ?,
        input_tax_code = ?,
        output_tax_code = ?,
        country_of_origin = ?,
        hs_code = ?,
        manufacturer_name = ?,
        manufacturer_part_number = ?,
        revenue_account_code = ?,
        inventory_account_code = ?,
        cogs_account_code = ?,
        expense_account_code = ?,
        notes = ?,
        image_url = ?,
        variant_group = ?,
        parent_product_id = ?,
        variant_code = ?,
        is_variant_parent = ?,
        is_variant = ?,
        variant_attributes_json = ?,
        alternate_uoms_json = ?,
        vendor_item_mappings_json = ?,
        sales_defaults_json = ?,
        purchasing_defaults_json = ?,
        mrp_defaults_json = ?,
        quality_defaults_json = ?,
        accounting_defaults_json = ?,
        tax_metadata_json = ?,
        compliance_metadata_json = ?,
        inventory_tracking_type = ?,
        is_bin_managed = ?,
        is_expiry_tracked = ?,
        picking_strategy = ?,
        is_lot_tracked = ?,
        is_serial_tracked = ?,
        serial_number_profile = ?,
        lot_number_profile = ?,
        quality_inspection_required = ?,
        batch_management_enabled = ?,
        returnable_item = ?,
        net_weight = ?,
        gross_weight = ?,
        weight_uom = ?,
        length_value = ?,
        width_value = ?,
        height_value = ?,
        dimension_uom = ?
      WHERE id = ?
        AND company_id = ?
        AND (? IS NULL OR branch_id <=> ?)
        AND (? IS NULL OR business_unit_id <=> ?)
      `,
      [
        payload.name,
        payload.description,
        payload.sku,
        payload.category_id,
        payload.item_type,
        payload.item_status,
        payload.lifecycle_stage,
        payload.material_type,
        payload.product_group,
        payload.brand,
        payload.uom,
        payload.base_uom_code,
        payload.sales_uom_code,
        payload.purchase_uom_code,
        payload.issue_uom_code,
        payload.conversion_mode,
        payload.barcode,
        payload.base_price,
        payload.market_price,
        payload.standard_cost,
        payload.selling_price,
        payload.valuation_method,
        payload.procurement_type,
        payload.planning_strategy,
        payload.reorder_point,
        payload.min_stock_level,
        payload.max_stock_level,
        payload.safety_stock,
        payload.min_order_qty,
        payload.max_order_qty,
        payload.fixed_lot_size,
        payload.lead_time_days,
        payload.shelf_life_days,
        payload.abc_class,
        payload.cycle_count_class,
        payload.preferred_warehouse_id,
        payload.track_inventory ? 1 : 0,
        payload.is_saleable ? 1 : 0,
        payload.is_purchaseable ? 1 : 0,
        payload.is_active ? 1 : 0,
        payload.tax_code,
        payload.tax_category_code,
        payload.input_tax_code,
        payload.output_tax_code,
        payload.country_of_origin,
        payload.hs_code,
        payload.manufacturer_name,
        payload.manufacturer_part_number,
        payload.revenue_account_code,
        payload.inventory_account_code,
        payload.cogs_account_code,
        payload.expense_account_code,
        payload.notes,
        payload.image_url,
        payload.variant_group,
        payload.parent_product_id,
        payload.variant_code,
        payload.is_variant_parent ? 1 : 0,
        payload.is_variant ? 1 : 0,
        payload.variant_attributes_json,
        payload.alternate_uoms_json,
        payload.vendor_item_mappings_json,
        payload.sales_defaults_json,
        payload.purchasing_defaults_json,
        payload.mrp_defaults_json,
        payload.quality_defaults_json,
        payload.accounting_defaults_json,
        payload.tax_metadata_json,
        payload.compliance_metadata_json,
        payload.inventory_tracking_type,
        payload.is_bin_managed ? 1 : 0,
        payload.is_expiry_tracked ? 1 : 0,
        payload.picking_strategy,
        payload.is_lot_tracked ? 1 : 0,
        payload.is_serial_tracked ? 1 : 0,
        payload.serial_number_profile,
        payload.lot_number_profile,
        payload.quality_inspection_required ? 1 : 0,
        payload.batch_management_enabled ? 1 : 0,
        payload.returnable_item ? 1 : 0,
        payload.net_weight,
        payload.gross_weight,
        payload.weight_uom,
        payload.length_value,
        payload.width_value,
        payload.height_value,
        payload.dimension_uom,
        id,
        scope.company_id,
        scope.branch_id,
        scope.branch_id,
        scope.business_unit_id,
        scope.business_unit_id,
      ]
    );

    const updatedProduct = await getProductById(id, scope);

    await createAuditLog({
      userId: req.user?.id || null,
      action: 'UPDATE',
      moduleName: 'Products',
      recordId: updatedProduct.id,
      description: `Updated SAP-level item master ${updatedProduct.name} (${updatedProduct.sku})`,
      oldValues: oldProduct,
      newValues: updatedProduct,
      ipAddress: getRequestIp(req),
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error('Update product error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      if (String(error.message || '').toLowerCase().includes('barcode')) {
        return res.status(400).json({ message: 'Barcode already exists in the active scope' });
      }
      return res.status(400).json({ message: 'SKU already exists in the active scope' });
    }

    res.status(500).json({ message: 'Failed to update product' });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { id } = req.params;

    const product = await getProductById(id, scope);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const [[stockRow]] = await db.query(
      `
      SELECT COALESCE(SUM(quantity), 0) AS total_quantity
      FROM inventory_stocks
      WHERE product_id = ?
        AND company_id = ?
        AND (? IS NULL OR branch_id <=> ?)
        AND (? IS NULL OR business_unit_id <=> ?)
      `,
      [
        id,
        scope.company_id,
        scope.branch_id,
        scope.branch_id,
        scope.business_unit_id,
        scope.business_unit_id,
      ]
    );

    if (Number(stockRow.total_quantity || 0) > 0) {
      return res.status(400).json({ message: 'Cannot delete a product with remaining stock' });
    }

    await db.query(
      `
      DELETE FROM inventory_stocks
      WHERE product_id = ?
        AND company_id = ?
        AND (? IS NULL OR branch_id <=> ?)
        AND (? IS NULL OR business_unit_id <=> ?)
      `,
      [
        id,
        scope.company_id,
        scope.branch_id,
        scope.branch_id,
        scope.business_unit_id,
        scope.business_unit_id,
      ]
    );

    await db.query(
      `
      DELETE FROM products
      WHERE id = ?
        AND company_id = ?
        AND (? IS NULL OR branch_id <=> ?)
        AND (? IS NULL OR business_unit_id <=> ?)
      `,
      [
        id,
        scope.company_id,
        scope.branch_id,
        scope.branch_id,
        scope.business_unit_id,
        scope.business_unit_id,
      ]
    );

    await createAuditLog({
      userId: req.user?.id || null,
      action: 'DELETE',
      moduleName: 'Products',
      recordId: product.id,
      description: `Deleted SAP-level item master ${product.name} (${product.sku})`,
      oldValues: product,
      ipAddress: getRequestIp(req),
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Failed to delete product' });
  }
};
