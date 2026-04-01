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

const toNumber = (value, defaultValue = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const toNullableNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const cleanText = (value) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
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

const getProductById = async (id, scope) => {
  const productScope = getProductScopeClause(scope, 'p');
  const [rows] = await db.query(
    `
    SELECT
      p.id,
      p.name,
      p.description,
      p.sku,
      p.category_id,
      p.item_type,
      p.product_group,
      p.brand,
      p.uom,
      p.barcode,
      p.base_price,
      p.market_price,
      p.standard_cost,
      p.selling_price,
      p.reorder_point,
      p.min_stock_level,
      p.max_stock_level,
      p.preferred_warehouse_id,
      pw.name AS preferred_warehouse_name,
      p.track_inventory,
      p.is_saleable,
      p.is_purchaseable,
      p.is_active,
      p.tax_code,
      p.country_of_origin,
      p.hs_code,
      p.notes,
      p.created_at,
      p.updated_at,
      p.inventory_tracking_type,
      p.is_bin_managed,
      p.is_expiry_tracked,
      p.picking_strategy,
      p.is_lot_tracked,
      p.is_serial_tracked,
      p.company_id,
      p.branch_id,
      p.business_unit_id,
      c.name AS category_name,
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
    ${getProductStockSummaryQuery()}
    WHERE p.id = ? ${productScope.sql}
    LIMIT 1
    `,
    [id, ...productScope.values]
  );

  return rows[0] || null;
};

const validateProductPayload = async ({ productId = null, payload, scope }) => {
  const errors = [];

  if (!payload.name) errors.push('Name is required');
  if (!payload.sku) errors.push('SKU is required');

  if (!['Inventory', 'Service', 'Non-Inventory'].includes(payload.item_type)) {
    errors.push('Invalid item type');
  }

  if (!['NONE', 'LOT', 'SERIAL'].includes(payload.inventory_tracking_type)) {
    errors.push('Invalid inventory tracking type');
  }

  if (!['MANUAL', 'FIFO', 'FEFO'].includes(payload.picking_strategy)) {
    errors.push('Invalid picking strategy');
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
    if (!category) {
      errors.push('Selected category was not found in the active scope');
    }
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
    if (!warehouse) {
      errors.push('Selected preferred warehouse was not found in the active scope');
    }
  }

  if (payload.min_stock_level > payload.max_stock_level && payload.max_stock_level > 0) {
    errors.push('Min stock level cannot be greater than max stock level');
  }

  if (payload.item_type !== 'Inventory' && payload.track_inventory) {
    errors.push('Only inventory items can track inventory');
  }

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

  const itemType = cleanText(body.item_type) || 'Inventory';
  const trackInventory =
    itemType === 'Inventory' ? toBoolean(body.track_inventory, true) : false;

  return {
    name: cleanText(body.name),
    description: cleanText(body.description),
    sku: cleanText(body.sku),
    category_id: toNullableNumber(body.category_id),
    item_type: itemType,
    product_group: cleanText(body.product_group),
    brand: cleanText(body.brand),
    uom: cleanText(body.uom) || 'PCS',
    barcode: cleanText(body.barcode),
    base_price: toNumber(body.base_price, 0),
    market_price: toNumber(body.market_price, 0),
    standard_cost: toNumber(body.standard_cost, toNumber(body.base_price, 0)),
    selling_price: toNumber(body.selling_price, toNumber(body.market_price, 0)),
    reorder_point: toNumber(body.reorder_point, 0),
    min_stock_level: toNumber(body.min_stock_level, 0),
    max_stock_level: toNumber(body.max_stock_level, 0),
    preferred_warehouse_id: toNullableNumber(body.preferred_warehouse_id),
    track_inventory: trackInventory,
    is_saleable: toBoolean(body.is_saleable, true),
    is_purchaseable: toBoolean(body.is_purchaseable, true),
    is_active: toBoolean(body.is_active, true),
    tax_code: cleanText(body.tax_code),
    country_of_origin: cleanText(body.country_of_origin),
    hs_code: cleanText(body.hs_code),
    notes: cleanText(body.notes),
    inventory_tracking_type: cleanText(body.inventory_tracking_type) || 'NONE',
    is_bin_managed: toBoolean(body.is_bin_managed, true),
    is_expiry_tracked: toBoolean(body.is_expiry_tracked, false),
    picking_strategy: cleanText(body.picking_strategy) || 'FIFO',
    is_lot_tracked: toBoolean(body.is_lot_tracked, false),
    is_serial_tracked: toBoolean(body.is_serial_tracked, false),
  };
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

    res.json({
      categories,
      warehouses,
      enums: {
        itemTypes: ['Inventory', 'Service', 'Non-Inventory'],
        inventoryTrackingTypes: ['NONE', 'LOT', 'SERIAL'],
        pickingStrategies: ['MANUAL', 'FIFO', 'FEFO'],
        statuses: ['In Stock', 'Low Stock', 'Out of Stock'],
      },
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
    } = req.query;

    const productScope = getProductScopeClause(scope, 'p');
    let sql = `
      SELECT
        p.id,
        p.name,
        p.description,
        p.sku,
        p.category_id,
        p.item_type,
        p.product_group,
        p.brand,
        p.uom,
        p.barcode,
        p.base_price,
        p.market_price,
        p.standard_cost,
        p.selling_price,
        p.reorder_point,
        p.min_stock_level,
        p.max_stock_level,
        p.preferred_warehouse_id,
        pw.name AS preferred_warehouse_name,
        p.track_inventory,
        p.is_saleable,
        p.is_purchaseable,
        p.is_active,
        p.tax_code,
        p.country_of_origin,
        p.hs_code,
        p.notes,
        p.created_at,
        p.updated_at,
        p.inventory_tracking_type,
        p.is_bin_managed,
        p.is_expiry_tracked,
        p.picking_strategy,
        p.is_lot_tracked,
        p.is_serial_tracked,
        p.company_id,
        p.branch_id,
        p.business_unit_id,
        c.name AS category_name,
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
      ${getProductStockSummaryQuery()}
      WHERE 1 = 1 ${productScope.sql}
    `;

    const values = [...productScope.values];

    if (search) {
      sql += `
        AND (
          p.name LIKE ?
          OR p.sku LIKE ?
          OR p.barcode LIKE ?
          OR p.brand LIKE ?
          OR p.product_group LIKE ?
        )
      `;
      values.push(
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

    if (is_active !== '') {
      sql += ' AND p.is_active = ?';
      values.push(toBoolean(is_active, true) ? 1 : 0);
    }

    if (track_inventory !== '') {
      sql += ' AND p.track_inventory = ?';
      values.push(toBoolean(track_inventory, false) ? 1 : 0);
    }

    sql += ' ORDER BY p.id DESC';

    const [rows] = await db.query(sql, values);
    res.json(rows);
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
      INSERT INTO products
      (
        name,
        description,
        sku,
        category_id,
        item_type,
        product_group,
        brand,
        uom,
        barcode,
        base_price,
        market_price,
        standard_cost,
        selling_price,
        reorder_point,
        min_stock_level,
        max_stock_level,
        preferred_warehouse_id,
        track_inventory,
        is_saleable,
        is_purchaseable,
        is_active,
        tax_code,
        country_of_origin,
        hs_code,
        notes,
        image_url,
        quantity,
        status,
        inventory_tracking_type,
        is_bin_managed,
        is_expiry_tracked,
        picking_strategy,
        is_lot_tracked,
        is_serial_tracked,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 'Out of Stock', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.name,
        payload.description,
        payload.sku,
        payload.category_id,
        payload.item_type,
        payload.product_group,
        payload.brand,
        payload.uom,
        payload.barcode,
        payload.base_price,
        payload.market_price,
        payload.standard_cost,
        payload.selling_price,
        payload.reorder_point,
        payload.min_stock_level,
        payload.max_stock_level,
        payload.preferred_warehouse_id,
        payload.track_inventory ? 1 : 0,
        payload.is_saleable ? 1 : 0,
        payload.is_purchaseable ? 1 : 0,
        payload.is_active ? 1 : 0,
        payload.tax_code,
        payload.country_of_origin,
        payload.hs_code,
        payload.notes,
        payload.inventory_tracking_type,
        payload.is_bin_managed ? 1 : 0,
        payload.is_expiry_tracked ? 1 : 0,
        payload.picking_strategy,
        payload.is_lot_tracked ? 1 : 0,
        payload.is_serial_tracked ? 1 : 0,
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
      description: `Created item master ${createdProduct.name} (${createdProduct.sku})`,
      newValues: createdProduct,
      ipAddress: getRequestIp(req),
    });

    res.status(201).json(createdProduct);
  } catch (error) {
    await connection.rollback();
    console.error('Create product error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      if (String(error.message || '').includes('barcode')) {
        return res.status(400).json({ message: 'Barcode already exists' });
      }
      return res.status(400).json({ message: 'SKU already exists' });
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
    const errors = await validateProductPayload({
      productId: id,
      payload,
      scope,
    });

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
        product_group = ?,
        brand = ?,
        uom = ?,
        barcode = ?,
        base_price = ?,
        market_price = ?,
        standard_cost = ?,
        selling_price = ?,
        reorder_point = ?,
        min_stock_level = ?,
        max_stock_level = ?,
        preferred_warehouse_id = ?,
        track_inventory = ?,
        is_saleable = ?,
        is_purchaseable = ?,
        is_active = ?,
        tax_code = ?,
        country_of_origin = ?,
        hs_code = ?,
        notes = ?,
        image_url = NULL,
        inventory_tracking_type = ?,
        is_bin_managed = ?,
        is_expiry_tracked = ?,
        picking_strategy = ?,
        is_lot_tracked = ?,
        is_serial_tracked = ?
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
        payload.product_group,
        payload.brand,
        payload.uom,
        payload.barcode,
        payload.base_price,
        payload.market_price,
        payload.standard_cost,
        payload.selling_price,
        payload.reorder_point,
        payload.min_stock_level,
        payload.max_stock_level,
        payload.preferred_warehouse_id,
        payload.track_inventory ? 1 : 0,
        payload.is_saleable ? 1 : 0,
        payload.is_purchaseable ? 1 : 0,
        payload.is_active ? 1 : 0,
        payload.tax_code,
        payload.country_of_origin,
        payload.hs_code,
        payload.notes,
        payload.inventory_tracking_type,
        payload.is_bin_managed ? 1 : 0,
        payload.is_expiry_tracked ? 1 : 0,
        payload.picking_strategy,
        payload.is_lot_tracked ? 1 : 0,
        payload.is_serial_tracked ? 1 : 0,
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
      description: `Updated item master ${updatedProduct.name} (${updatedProduct.sku})`,
      oldValues: oldProduct,
      newValues: updatedProduct,
      ipAddress: getRequestIp(req),
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error('Update product error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      if (String(error.message || '').includes('barcode')) {
        return res.status(400).json({ message: 'Barcode already exists' });
      }
      return res.status(400).json({ message: 'SKU already exists' });
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
      return res.status(400).json({
        message: 'Cannot delete a product with remaining stock',
      });
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
      description: `Deleted item master ${product.name} (${product.sku})`,
      oldValues: product,
      ipAddress: getRequestIp(req),
    });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Failed to delete product' });
  }
};
