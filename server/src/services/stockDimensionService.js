import db from '../config/db.js';

export const getOrCreateInventoryStockRowForUpdate = async (connection, productId, warehouseId) => {
  const [[row]] = await connection.query(
    `
    SELECT *
    FROM inventory_stocks
    WHERE product_id = ? AND warehouse_id = ?
    FOR UPDATE
    `,
    [productId, warehouseId]
  );

  if (row) return row;

  await connection.query(
    `
    INSERT INTO inventory_stocks (
      product_id,
      warehouse_id,
      quantity,
      reserved_quantity,
      available_quantity,
      unit_cost,
      total_value
    )
    VALUES (?, ?, 0, 0, 0, 0, 0)
    `,
    [productId, warehouseId]
  );

  const [[newRow]] = await connection.query(
    `
    SELECT *
    FROM inventory_stocks
    WHERE product_id = ? AND warehouse_id = ?
    FOR UPDATE
    `,
    [productId, warehouseId]
  );

  return newRow;
};

export const getOrCreateInventoryBinStockRowForUpdate = async (
  connection,
  productId,
  warehouseId,
  binId
) => {
  const [[row]] = await connection.query(
    `
    SELECT *
    FROM inventory_bin_stocks
    WHERE product_id = ? AND warehouse_id = ? AND bin_id = ?
    FOR UPDATE
    `,
    [productId, warehouseId, binId]
  );

  if (row) return row;

  await connection.query(
    `
    INSERT INTO inventory_bin_stocks (
      product_id,
      warehouse_id,
      bin_id,
      quantity,
      reserved_quantity,
      available_quantity,
      unit_cost,
      total_value
    )
    VALUES (?, ?, ?, 0, 0, 0, 0, 0)
    `,
    [productId, warehouseId, binId]
  );

  const [[newRow]] = await connection.query(
    `
    SELECT *
    FROM inventory_bin_stocks
    WHERE product_id = ? AND warehouse_id = ? AND bin_id = ?
    FOR UPDATE
    `,
    [productId, warehouseId, binId]
  );

  return newRow;
};

export const getOrCreateInventoryLotStockRowForUpdate = async (
  connection,
  productId,
  warehouseId,
  binId,
  lotId
) => {
  const [[row]] = await connection.query(
    `
    SELECT *
    FROM inventory_lot_stocks
    WHERE product_id = ? AND warehouse_id = ? AND bin_id <=> ? AND lot_id = ?
    FOR UPDATE
    `,
    [productId, warehouseId, binId ?? null, lotId]
  );

  if (row) return row;

  await connection.query(
    `
    INSERT INTO inventory_lot_stocks (
      product_id,
      warehouse_id,
      bin_id,
      lot_id,
      quantity,
      reserved_quantity,
      available_quantity,
      unit_cost,
      total_value
    )
    VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0)
    `,
    [productId, warehouseId, binId ?? null, lotId]
  );

  const [[newRow]] = await connection.query(
    `
    SELECT *
    FROM inventory_lot_stocks
    WHERE product_id = ? AND warehouse_id = ? AND bin_id <=> ? AND lot_id = ?
    FOR UPDATE
    `,
    [productId, warehouseId, binId ?? null, lotId]
  );

  return newRow;
};

export const recomputeAvailable = ({ quantity, reservedQuantity }) => {
  const q = Number(quantity || 0);
  const r = Number(reservedQuantity || 0);
  return Number((q - r).toFixed(4));
};

export const updateInventoryStockSnapshot = async (connection, stockId, payload) => {
  await connection.query(
    `
    UPDATE inventory_stocks
    SET
      quantity = ?,
      reserved_quantity = ?,
      available_quantity = ?,
      unit_cost = ?,
      total_value = ?
    WHERE id = ?
    `,
    [
      payload.quantity,
      payload.reserved_quantity,
      payload.available_quantity,
      payload.unit_cost,
      payload.total_value,
      stockId,
    ]
  );
};

export const updateInventoryBinStockSnapshot = async (connection, stockId, payload) => {
  await connection.query(
    `
    UPDATE inventory_bin_stocks
    SET
      quantity = ?,
      reserved_quantity = ?,
      available_quantity = ?,
      unit_cost = ?,
      total_value = ?
    WHERE id = ?
    `,
    [
      payload.quantity,
      payload.reserved_quantity,
      payload.available_quantity,
      payload.unit_cost,
      payload.total_value,
      stockId,
    ]
  );
};

export const updateInventoryLotStockSnapshot = async (connection, stockId, payload) => {
  await connection.query(
    `
    UPDATE inventory_lot_stocks
    SET
      quantity = ?,
      reserved_quantity = ?,
      available_quantity = ?,
      unit_cost = ?,
      total_value = ?
    WHERE id = ?
    `,
    [
      payload.quantity,
      payload.reserved_quantity,
      payload.available_quantity,
      payload.unit_cost,
      payload.total_value,
      stockId,
    ]
  );
};

export const syncProductWarehouseTotals = async (connection, productId) => {
  const [[sumRow]] = await connection.query(
    `
    SELECT
      COALESCE(SUM(quantity), 0) AS total_quantity
    FROM inventory_stocks
    WHERE product_id = ?
    `,
    [productId]
  );

  const totalQty = Number(sumRow?.total_quantity || 0);

  await connection.query(
    `
    UPDATE products
    SET quantity = ?
    WHERE id = ?
    `,
    [totalQty, productId]
  );

  return totalQty;
};