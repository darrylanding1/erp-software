import db from '../config/db.js';

export const round2 = (value) => Number(Number(value || 0).toFixed(2));

export const getStockStatus = (quantity) => {
  const qty = Number(quantity) || 0;

  if (qty <= 0) return 'Out of Stock';
  if (qty <= 10) return 'Low Stock';
  return 'In Stock';
};

export const ensureInventoryRow = async (connection, productId, warehouseId) => {
  await connection.query(
    `
    INSERT INTO inventory_stocks
    (
      product_id,
      warehouse_id,
      quantity,
      unit_cost,
      total_value
    )
    VALUES (?, ?, 0, 0, 0)
    ON DUPLICATE KEY UPDATE updated_at = updated_at
    `,
    [productId, warehouseId]
  );
};

export const initializeProductInventoryRows = async (connection, productId) => {
  const [warehouseRows] = await connection.query(
    `
    SELECT id
    FROM warehouses
    `
  );

  for (const warehouse of warehouseRows) {
    await ensureInventoryRow(connection, productId, warehouse.id);
  }
};

export const syncProductInventorySummary = async (connection, productId) => {
  const [[stockRow]] = await connection.query(
    `
    SELECT
      COALESCE(SUM(quantity), 0) AS total_quantity,
      COALESCE(SUM(total_value), 0) AS total_value
    FROM inventory_stocks
    WHERE product_id = ?
    `,
    [productId]
  );

  const totalQuantity = Number(stockRow?.total_quantity || 0);
  const status = getStockStatus(totalQuantity);

  await connection.query(
    `
    UPDATE products
    SET quantity = ?, status = ?
    WHERE id = ?
    `,
    [totalQuantity, status, productId]
  );

  return {
    totalQuantity,
    totalValue: round2(stockRow?.total_value || 0),
    status,
  };
};

export const getInventoryStockForUpdate = async (
  connection,
  productId,
  warehouseId
) => {
  await ensureInventoryRow(connection, productId, warehouseId);

  const [[stockRow]] = await connection.query(
    `
    SELECT
      id,
      product_id,
      warehouse_id,
      quantity,
      unit_cost,
      total_value
    FROM inventory_stocks
    WHERE product_id = ? AND warehouse_id = ?
    FOR UPDATE
    `,
    [productId, warehouseId]
  );

  return stockRow || null;
};

export const increaseWarehouseStock = async (
  connection,
  { productId, warehouseId, quantity, unitCost = null }
) => {
  const qty = Number(quantity);

  if (!qty || qty <= 0) {
    throw new Error('Increase quantity must be greater than zero');
  }

  const stockRow = await getInventoryStockForUpdate(connection, productId, warehouseId);

  const previousQuantity = Number(stockRow.quantity || 0);
  const previousUnitCost = round2(stockRow.unit_cost || 0);
  const incomingUnitCost =
    unitCost === null || unitCost === undefined
      ? previousUnitCost
      : round2(unitCost);

  const newQuantity = previousQuantity + qty;

  let newUnitCost = previousUnitCost;

  if (newQuantity > 0) {
    if (previousQuantity <= 0) {
      newUnitCost = incomingUnitCost;
    } else {
      newUnitCost = round2(
        ((previousQuantity * previousUnitCost) + (qty * incomingUnitCost)) /
          newQuantity
      );
    }
  }

  const newTotalValue = round2(newQuantity * newUnitCost);

  await connection.query(
    `
    UPDATE inventory_stocks
    SET
      quantity = ?,
      unit_cost = ?,
      total_value = ?
    WHERE id = ?
    `,
    [newQuantity, newUnitCost, newTotalValue, stockRow.id]
  );

  await syncProductInventorySummary(connection, productId);

  return {
    inventoryStockId: stockRow.id,
    previousQuantity,
    newQuantity,
    previousUnitCost,
    newUnitCost,
    newTotalValue,
  };
};

export const decreaseWarehouseStock = async (
  connection,
  { productId, warehouseId, quantity }
) => {
  const qty = Number(quantity);

  if (!qty || qty <= 0) {
    throw new Error('Decrease quantity must be greater than zero');
  }

  const stockRow = await getInventoryStockForUpdate(connection, productId, warehouseId);

  const previousQuantity = Number(stockRow.quantity || 0);
  const currentUnitCost = round2(stockRow.unit_cost || 0);

  if (qty > previousQuantity) {
    throw new Error('Insufficient stock');
  }

  const newQuantity = previousQuantity - qty;
  const newTotalValue = round2(newQuantity * currentUnitCost);

  await connection.query(
    `
    UPDATE inventory_stocks
    SET
      quantity = ?,
      total_value = ?
    WHERE id = ?
    `,
    [newQuantity, newTotalValue, stockRow.id]
  );

  await syncProductInventorySummary(connection, productId);

  return {
    inventoryStockId: stockRow.id,
    previousQuantity,
    newQuantity,
    unitCost: currentUnitCost,
    newTotalValue,
  };
};

export const setWarehouseStockQuantity = async (
  connection,
  { productId, warehouseId, newQuantity, unitCost = null }
) => {
  const qty = Number(newQuantity);

  if (Number.isNaN(qty) || qty < 0) {
    throw new Error('Adjusted quantity must be zero or greater');
  }

  const stockRow = await getInventoryStockForUpdate(connection, productId, warehouseId);

  const currentUnitCost =
    unitCost === null || unitCost === undefined
      ? round2(stockRow.unit_cost || 0)
      : round2(unitCost);

  const newTotalValue = round2(qty * currentUnitCost);

  await connection.query(
    `
    UPDATE inventory_stocks
    SET
      quantity = ?,
      unit_cost = ?,
      total_value = ?
    WHERE id = ?
    `,
    [qty, currentUnitCost, newTotalValue, stockRow.id]
  );

  await syncProductInventorySummary(connection, productId);

  return {
    inventoryStockId: stockRow.id,
    previousQuantity: Number(stockRow.quantity || 0),
    newQuantity: qty,
    unitCost: currentUnitCost,
    newTotalValue,
  };
};

export const transferWarehouseStock = async (
  connection,
  { productId, fromWarehouseId, toWarehouseId, quantity }
) => {
  const qty = Number(quantity);

  if (!qty || qty <= 0) {
    throw new Error('Transfer quantity must be greater than zero');
  }

  if (Number(fromWarehouseId) === Number(toWarehouseId)) {
    throw new Error('Source and destination warehouse must be different');
  }

  const fromResult = await decreaseWarehouseStock(connection, {
    productId,
    warehouseId: fromWarehouseId,
    quantity: qty,
  });

  const toResult = await increaseWarehouseStock(connection, {
    productId,
    warehouseId: toWarehouseId,
    quantity: qty,
    unitCost: fromResult.unitCost,
  });

  return {
    quantity: qty,
    unitCost: fromResult.unitCost,
    from: fromResult,
    to: toResult,
  };
};

export const getProductStockSummaryQuery = () => `
  LEFT JOIN (
    SELECT
      product_id,
      COALESCE(SUM(quantity), 0) AS total_quantity,
      0 AS total_reserved_quantity,
      COALESCE(SUM(quantity), 0) AS total_available_quantity,
      COALESCE(SUM(total_value), 0) AS total_value
    FROM inventory_stocks
    GROUP BY product_id
  ) stock ON stock.product_id = p.id
`;