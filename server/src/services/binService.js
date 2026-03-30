import db from '../config/db.js';

export const getBinMetaService = async () => {
  const [warehouses] = await db.query(`
    SELECT id, name
    FROM warehouses
    ORDER BY name ASC
  `);

  const [zones] = await db.query(`
    SELECT
      wz.id,
      wz.warehouse_id,
      wz.zone_code,
      wz.zone_name,
      wz.zone_type,
      w.name AS warehouse_name
    FROM warehouse_zones wz
    INNER JOIN warehouses w ON w.id = wz.warehouse_id
    WHERE wz.is_active = 1
    ORDER BY w.name ASC, wz.zone_code ASC
  `);

  return { warehouses, zones };
};

export const getBinsService = async ({ warehouse_id = '', zone_id = '', search = '' }) => {
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
    WHERE 1 = 1
  `;

  const values = [];

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
}) => {
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
  }
) => {
  const [result] = await db.query(
    `
    UPDATE warehouse_bins
    SET
      warehouse_id = ?,
      zone_id = ?,
      bin_code = ?,
      bin_name = ?,
      bin_type = ?,
      allow_mixed_products = ?,
      allow_negative_stock = ?,
      max_capacity_qty = ?,
      sort_order = ?,
      is_active = ?
    WHERE id = ?
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
    ]
  );

  return result.affectedRows;
};

export const updateBinStatusService = async (id, isActive) => {
  const [result] = await db.query(
    `
    UPDATE warehouse_bins
    SET is_active = ?
    WHERE id = ?
    `,
    [isActive ? 1 : 0, Number(id)]
  );

  return result.affectedRows;
};