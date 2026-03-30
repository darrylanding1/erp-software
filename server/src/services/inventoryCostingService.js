import { round4, toNumber } from '../utils/number.js';

export const getOrCreateInventoryStockRowForUpdate = async (
  connection,
  productId,
  warehouseId
) => {
  const [[stockRow]] = await connection.query(
    `
    SELECT *
    FROM inventory_stocks
    WHERE product_id = ? AND warehouse_id = ?
    FOR UPDATE
    `,
    [productId, warehouseId]
  );

  if (stockRow) return stockRow;

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

export const calculateMovingAverageReceipt = ({
  currentQty,
  currentValue,
  receivedQty,
  receivedUnitCost,
}) => {
  const qtyBefore = toNumber(currentQty);
  const valueBefore = toNumber(currentValue);
  const qtyIn = toNumber(receivedQty);
  const unitCostIn = toNumber(receivedUnitCost);

  const receiptValue = round4(qtyIn * unitCostIn);
  const qtyAfter = round4(qtyBefore + qtyIn);
  const valueAfter = round4(valueBefore + receiptValue);
  const avgAfter = qtyAfter === 0 ? 0 : round4(valueAfter / qtyAfter);

  return {
    qtyBefore,
    valueBefore,
    avgBefore: qtyBefore === 0 ? 0 : round4(valueBefore / qtyBefore),
    qtyIn,
    receiptValue,
    qtyAfter,
    valueAfter,
    avgAfter,
    issueUnitCost: avgAfter,
  };
};

export const calculateIssueAtAverage = ({
  currentQty,
  currentValue,
  issueQty,
}) => {
  const qtyBefore = toNumber(currentQty);
  const valueBefore = toNumber(currentValue);
  const qtyOut = toNumber(issueQty);

  if (qtyOut > qtyBefore) {
    throw new Error('Insufficient stock for issue transaction');
  }

  const avgBefore = qtyBefore === 0 ? 0 : round4(valueBefore / qtyBefore);
  const issueValue = round4(qtyOut * avgBefore);
  const qtyAfter = round4(qtyBefore - qtyOut);
  const valueAfter = round4(valueBefore - issueValue);
  const avgAfter = qtyAfter === 0 ? 0 : round4(valueAfter / qtyAfter);

  return {
    qtyBefore,
    valueBefore,
    avgBefore,
    qtyOut,
    issueValue,
    issueUnitCost: avgBefore,
    qtyAfter,
    valueAfter,
    avgAfter,
  };
};

export const updateInventoryStockSnapshot = async (
  connection,
  stockId,
  { quantity, reserved_quantity = 0, available_quantity = 0, unit_cost, total_value }
) => {
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
    [quantity, reserved_quantity, available_quantity, unit_cost, total_value, stockId]
  );
};