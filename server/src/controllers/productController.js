import db from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAuditLog, getRequestIp } from '../utils/auditTrail.js';
import {
  getProductStockSummaryQuery,
  initializeProductInventoryRows,
  syncProductInventorySummary,
} from '../utils/inventoryStock.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const stockStatusSql = `
  CASE
    WHEN COALESCE(stock.total_quantity, 0) <= 0 THEN 'Out of Stock'
    WHEN COALESCE(stock.total_quantity, 0) <= COALESCE(NULLIF(p.reorder_point, 0), 10) THEN 'Low Stock'
    ELSE 'In Stock'
  END
`;

const getImageUrl = (req, filename) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}/uploads/${filename}`;
};

const deleteImageFile = (imageUrl) => {
  try {
    if (!imageUrl) return;
    const filename = imageUrl.split('/uploads/')[1];
    if (!filename) return;

    const filePath = path.join(__dirname, '..', 'uploads', filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Delete image file error:', error);
  }
};

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

const getProductById = async (id) => {
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
      p.image_url,
      p.created_at,
      p.updated_at,
      p.inventory_tracking_type,
      p.is_bin_managed,
      p.is_expiry_tracked,
      p.picking_strategy,
      p.is_lot_tracked,
      p.is_serial_tracked,
      c.name AS category_name,
      COALESCE(stock.total_quantity, 0) AS quantity,
      COALESCE(stock.total_reserved_quantity, 0) AS reserved_quantity,
      COALESCE(stock.total_available_quantity, 0) AS available_quantity,
      COALESCE(stock.total_value, 0) AS stock_value,
      ${stockStatusSql} AS status
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN warehouses pw ON p.preferred_warehouse_id = pw.id
    ${getProductStockSummaryQuery()}
    WHERE p.id = ?
    LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
};

const validateProductPayload = async ({ productId = null, payload }) => {
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
    const [categoryRows] = await db.query(
      'SELECT id FROM categories WHERE id = ? LIMIT 1',
      [payload.category_id]
    );
    if (categoryRows.length === 0) {
      errors.push('Selected category was not found');
    }
  }

  if (payload.preferred_warehouse_id) {
    const [warehouseRows] = await db.query(
      'SELECT id FROM warehouses WHERE id = ? LIMIT 1',
      [payload.preferred_warehouse_id]
    );
    if (warehouseRows.length === 0) {
      errors.push('Selected preferred warehouse was not found');
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
      `,
      [productId]
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
    itemType === 'Inventory'
      ? toBoolean(body.track_inventory, true)
      : false;

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

export const getProductMeta = async (_req, res) => {
  try {
    const [categories] = await db.query(
      `
      SELECT id, name
      FROM categories
      ORDER BY name ASC
      `
    );

    const [warehouses] = await db.query(
      `
      SELECT id, name, code
      FROM warehouses
      WHERE status = 'Active'
      ORDER BY name ASC
      `
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
    res.status(500).json({ message: 'Failed to fetch product meta' });
  }
};

export const getProducts = async (req, res) => {
  try {
    const {
      search = '',
      category_id = '',
      status = '',
      item_type = '',
      is_active = '',
      track_inventory = '',
    } = req.query;

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
        p.image_url,
        p.created_at,
        p.updated_at,
        p.inventory_tracking_type,
        p.is_bin_managed,
        p.is_expiry_tracked,
        p.picking_strategy,
        p.is_lot_tracked,
        p.is_serial_tracked,
        c.name AS category_name,
        COALESCE(stock.total_quantity, 0) AS quantity,
        COALESCE(stock.total_reserved_quantity, 0) AS reserved_quantity,
        COALESCE(stock.total_available_quantity, 0) AS available_quantity,
        COALESCE(stock.total_value, 0) AS stock_value,
        ${stockStatusSql} AS status
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN warehouses pw ON p.preferred_warehouse_id = pw.id
      ${getProductStockSummaryQuery()}
      WHERE 1 = 1
    `;

    const values = [];

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
    res.status(500).json({ message: 'Failed to fetch products' });
  }
};

export const createProduct = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const payload = mapRequestToProductPayload(req);
    const errors = await validateProductPayload({ payload });

    if (errors.length > 0) {
      await connection.rollback();
      return res.status(400).json({ message: errors[0] });
    }

    const image_url = req.file ? getImageUrl(req, req.file.filename) : null;

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
        is_serial_tracked
      )
      VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Out of Stock', ?, ?, ?, ?, ?, ?)
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
        image_url,
        payload.inventory_tracking_type,
        payload.is_bin_managed ? 1 : 0,
        payload.is_expiry_tracked ? 1 : 0,
        payload.picking_strategy,
        payload.is_lot_tracked ? 1 : 0,
        payload.is_serial_tracked ? 1 : 0,
      ]
    );

    await initializeProductInventoryRows(connection, result.insertId);
    await syncProductInventorySummary(connection, result.insertId);

    await connection.commit();

    const createdProduct = await getProductById(result.insertId);

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
    const { id } = req.params;

    const [existingRows] = await db.query(
      'SELECT * FROM products WHERE id = ?',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const oldProduct = existingRows[0];
    const payload = mapRequestToProductPayload(req);
    const errors = await validateProductPayload({
      productId: id,
      payload,
    });

    if (errors.length > 0) {
      return res.status(400).json({ message: errors[0] });
    }

    let image_url = req.body.existing_image_url || oldProduct.image_url;

    if (req.file) {
      image_url = getImageUrl(req, req.file.filename);
      if (oldProduct.image_url) {
        deleteImageFile(oldProduct.image_url);
      }
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
        image_url = ?,
        inventory_tracking_type = ?,
        is_bin_managed = ?,
        is_expiry_tracked = ?,
        picking_strategy = ?,
        is_lot_tracked = ?,
        is_serial_tracked = ?
      WHERE id = ?
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
        image_url,
        payload.inventory_tracking_type,
        payload.is_bin_managed ? 1 : 0,
        payload.is_expiry_tracked ? 1 : 0,
        payload.picking_strategy,
        payload.is_lot_tracked ? 1 : 0,
        payload.is_serial_tracked ? 1 : 0,
        id,
      ]
    );

    const updatedProduct = await getProductById(id);

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
    const { id } = req.params;

    const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = rows[0];

    const [[stockRow]] = await db.query(
      `
      SELECT COALESCE(SUM(quantity), 0) AS total_quantity
      FROM inventory_stocks
      WHERE product_id = ?
      `,
      [id]
    );

    if (Number(stockRow.total_quantity || 0) > 0) {
      return res.status(400).json({
        message: 'Cannot delete a product with remaining stock',
      });
    }

    if (product.image_url) {
      deleteImageFile(product.image_url);
    }

    await db.query('DELETE FROM inventory_stocks WHERE product_id = ?', [id]);
    await db.query('DELETE FROM products WHERE id = ?', [id]);

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