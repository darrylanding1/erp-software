import db from '../config/db.js';
import { buildScopeWhereClause } from '../middleware/dataScopeMiddleware.js';

const buildWarehouseScope = (scope, alias = 'w') =>
  buildScopeWhereClause(scope, {
    company: `${alias}.company_id`,
    branch: `${alias}.branch_id`,
    businessUnit: `${alias}.business_unit_id`,
  });

const assertWarehouseInScope = async (warehouseId, scope) => {
  const warehouseScope = buildWarehouseScope(scope, 'w');
  const [rows] = await db.query(
    `
    SELECT w.id
    FROM warehouses w
    WHERE w.id = ? ${warehouseScope.sql}
    LIMIT 1
    `,
    [Number(warehouseId), ...warehouseScope.values]
  );

  if (!rows.length) {
    const error = new Error('Warehouse does not belong to the active scope');
    error.statusCode = 403;
    throw error;
  }
};

export const getBinMetaService = async (scope) => {
  const warehouseScope = buildWarehouseScope(scope, 'w');

  const [warehouses] = await db.query(
    `
    SELECT id, name
    FROM warehouses w
    WHERE 1 = 1 ${warehouseScope.sql}
    ORDER BY name ASC
  `,
    warehouseScope.values
  );

  const [zones] = await db.query(
    `
    SELECT
      wz.id,
      wz.warehouse_id,
      wz.zone_code,
      wz.zone_name,
      wz.zone_type,
      w.name AS warehouse_name
    FROM warehouse_zones wz
    INNER JOIN warehouses w ON w.id = wz.warehouse_id
    WHERE wz.is_active = 1 ${warehouseScope.sql}
    ORDER BY w.name ASC, wz.zone_code ASC
  `,
    warehouseScope.values
  );

  return { warehouses, zones };
};

export const getBinsService = async ({ warehouse_id = '', zone_id = '', search = '' }, scope) => {
  const warehouseScope = buildWarehouseScope(scope, 'w');
  let sql = `
    SELECT
      wb.*,
      w.name AS warehouse_name,
      wz.zone_code,
      wz.zone_name
    FROM warehouse_bins wb
    INNER JOIN warehouses w
      ON w.id = wb.warehouse_id
    LEFT JOIN warehouse_zones wz
      ON wz.id = wb.zone_id
    WHERE 1 = 1 ${warehouseScope.sql}
  `;

  const values = [...warehouseScope.values];

  if (warehouse_id) {
    sql += ` AND wb.warehouse_id = ?`;
    values.push(Number(warehouse_id));
  }

  if (zone_id) {
    sql += ` AND wb.zone_id = ?`;
    values.push(Number(zone_id));
  }

  if (search) {
    sql += ` AND (
      wb.bin_code LIKE ?
      OR wb.bin_name LIKE ?
      OR wz.zone_code LIKE ?
      OR wz.zone_name LIKE ?
    )`;
    const keyword = `%${search}%`;
    values.push(keyword, keyword, keyword, keyword);
  }

  sql += ` ORDER BY w.name ASC, wb.bin_code ASC`;

  const [rows] = await db.query(sql, values);
  return rows;
};

export const createBinService = async ({
  warehouse_id,
  zone_id,
  bin_code,
  bin_name,
  bin_type,
  allow_mixed_products,
  allow_negative_stock,
  max_capacity_qty,
  sort_order,
}, scope) => {
  await assertWarehouseInScope(warehouse_id, scope);

  const [result] = await db.query(
    `
    INSERT INTO warehouse_bins (
      warehouse_id,
      zone_id,
      bin_code,
      bin_name,
      bin_type,
      is_active,
      allow_mixed_products,
      allow_negative_stock,
      max_capacity_qty,
      sort_order
    )
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `,
    [
      Number(warehouse_id),
      zone_id ? Number(zone_id) : null,
      bin_code,
      bin_name || null,
      bin_type || 'STORAGE',
      allow_mixed_products ? 1 : 0,
      allow_negative_stock ? 1 : 0,
      max_capacity_qty ? Number(max_capacity_qty) : null,
      sort_order ? Number(sort_order) : 0,
    ]
  );

  return result.insertId;
};

export const updateBinService = async (
  id,
  {
    warehouse_id,
    zone_id,
    bin_code,
    bin_name,
    bin_type,
    allow_mixed_products,
    allow_negative_stock,
    max_capacity_qty,
    sort_order,
    is_active,
  },
  scope
) => {
  await assertWarehouseInScope(warehouse_id, scope);
  const warehouseScope = buildWarehouseScope(scope, 'w');

  const [result] = await db.query(
    `
    UPDATE warehouse_bins wb
    INNER JOIN warehouses w ON w.id = wb.warehouse_id
    SET
      wb.warehouse_id = ?,
      wb.zone_id = ?,
      wb.bin_code = ?,
      wb.bin_name = ?,
      wb.bin_type = ?,
      wb.allow_mixed_products = ?,
      wb.allow_negative_stock = ?,
      wb.max_capacity_qty = ?,
      wb.sort_order = ?,
      wb.is_active = ?
    WHERE wb.id = ? ${warehouseScope.sql}
    `,
    [
      Number(warehouse_id),
      zone_id ? Number(zone_id) : null,
      bin_code,
      bin_name || null,
      bin_type || 'STORAGE',
      allow_mixed_products ? 1 : 0,
      allow_negative_stock ? 1 : 0,
      max_capacity_qty ? Number(max_capacity_qty) : null,
      sort_order ? Number(sort_order) : 0,
      is_active ? 1 : 0,
      Number(id),
      ...warehouseScope.values,
    ]
  );

  return result.affectedRows;
};

export const updateBinStatusService = async (id, isActive, scope) => {
  const warehouseScope = buildWarehouseScope(scope, 'w');
  const [result] = await db.query(
    `
    UPDATE warehouse_bins wb
    INNER JOIN warehouses w ON w.id = wb.warehouse_id
    SET wb.is_active = ?
    WHERE wb.id = ? ${warehouseScope.sql}
    `,
    [isActive ? 1 : 0, Number(id), ...warehouseScope.values]
  );

  return result.affectedRows;
};