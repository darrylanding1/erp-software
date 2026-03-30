import db from '../config/db.js';
import {
  getOrCreateInventoryStockRowForUpdate,
  getOrCreateInventoryBinStockRowForUpdate,
  getOrCreateInventoryLotStockRowForUpdate,
  updateInventoryStockSnapshot,
  updateInventoryBinStockSnapshot,
  updateInventoryLotStockSnapshot,
  recomputeAvailable,
  syncProductWarehouseTotals,
} from './stockDimensionService.js';
import { insertInventoryLedger } from './inventoryLedgerService.js';
import { round4 } from '../utils/number.js';

const getNextAdjustmentNumber = async (connection) => {
  const [rows] = await connection.query(
    `
    SELECT adjustment_number
    FROM inventory_adjustments
    ORDER BY id DESC
    LIMIT 1
    `
  );

  if (!rows.length || !rows[0].adjustment_number) {
    return 'ADJ-00001';
  }

  const currentNumber = rows[0].adjustment_number;
  const numericPart = Number(String(currentNumber).split('-').pop() || 0) + 1;

  return `ADJ-${String(numericPart).padStart(5, '0')}`;
};

const getApprovalRoleForAdjustment = async (
  connection,
  warehouseId,
  totalValueVariance
) => {
  const [rules] = await connection.query(
    `
    SELECT *
    FROM approval_rules
    WHERE module_code = 'INVENTORY'
      AND transaction_type = 'ADJUSTMENT'
      AND is_active = 1
      AND (warehouse_id IS NULL OR warehouse_id = ?)
      AND ? >= min_variance_value
      AND (max_variance_value IS NULL OR ? <= max_variance_value)
    ORDER BY warehouse_id DESC, min_variance_value DESC
    LIMIT 1
    `,
    [warehouseId, totalValueVariance, totalValueVariance]
  );

  return rules[0] || null;
};

export const getInventoryAdjustmentsService = async (filters = {}) => {
  const {
    status = '',
    warehouse_id = '',
    date_from = '',
    date_to = '',
    search = '',
  } = filters;

  let sql = `
    SELECT
      ia.*,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      creator.full_name AS created_by_name,
      approver.full_name AS approved_by_name,
      poster.full_name AS posted_by_name,
      COUNT(iai.id) AS item_count
    FROM inventory_adjustments ia
    INNER JOIN warehouses w
      ON w.id = ia.warehouse_id
    LEFT JOIN users creator
      ON creator.id = ia.created_by
    LEFT JOIN users approver
      ON approver.id = ia.approved_by
    LEFT JOIN users poster
      ON poster.id = ia.posted_by
    LEFT JOIN inventory_adjustment_items iai
      ON iai.inventory_adjustment_id = ia.id
    WHERE 1 = 1
  `;
  const values = [];

  if (status) {
    sql += ` AND ia.status = ?`;
    values.push(status);
  }

  if (warehouse_id) {
    sql += ` AND ia.warehouse_id = ?`;
    values.push(Number(warehouse_id));
  }

  if (date_from) {
    sql += ` AND ia.adjustment_date >= ?`;
    values.push(date_from);
  }

  if (date_to) {
    sql += ` AND ia.adjustment_date <= ?`;
    values.push(date_to);
  }

  if (search) {
    sql += ` AND (ia.adjustment_number LIKE ? OR ia.remarks LIKE ?)`;
    values.push(`%${search}%`, `%${search}%`);
  }

  sql += ` GROUP BY ia.id ORDER BY ia.id DESC`;

  const [rows] = await db.query(sql, values);
  return rows;
};

export const getInventoryAdjustmentByIdService = async (id) => {
  const [[header]] = await db.query(
    `
    SELECT
      ia.*,
      w.name AS warehouse_name,
      w.code AS warehouse_code
    FROM inventory_adjustments ia
    INNER JOIN warehouses w
      ON w.id = ia.warehouse_id
    WHERE ia.id = ?
    `,
    [id]
  );

  if (!header) return null;

  const [items] = await db.query(
    `
    SELECT
      iai.*,
      p.name AS product_name,
      p.sku,
      wb.bin_code,
      l.lot_number,
      l.batch_number
    FROM inventory_adjustment_items iai
    INNER JOIN products p
      ON p.id = iai.product_id
    LEFT JOIN warehouse_bins wb
      ON wb.id = iai.bin_id
    LEFT JOIN inventory_lots l
      ON l.id = iai.lot_id
    WHERE iai.inventory_adjustment_id = ?
    ORDER BY iai.id ASC
    `,
    [id]
  );

  header.items = items;
  return header;
};

export const createInventoryAdjustmentService = async (connection, payload, userId) => {
  const {
    warehouse_id,
    adjustment_date,
    source_type = 'MANUAL',
    source_id = null,
    reason_code = null,
    remarks = null,
    items = [],
  } = payload;

  if (!warehouse_id || !adjustment_date) {
    throw new Error('warehouse_id and adjustment_date are required');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one adjustment item is required');
  }

  const adjustmentNumber = await getNextAdjustmentNumber(connection);

  let totalQtyVariance = 0;
  let totalValueVariance = 0;

  for (const item of items) {
    const varianceQty = round4(item.quantity_after) - round4(item.quantity_before);
    const varianceValue = round4(varianceQty * round4(item.unit_cost));

    totalQtyVariance = round4(totalQtyVariance + varianceQty);
    totalValueVariance = round4(totalValueVariance + varianceValue);
  }

  const approvalRule = await getApprovalRoleForAdjustment(
    connection,
    Number(warehouse_id),
    Math.abs(totalValueVariance)
  );

  const initialStatus = approvalRule ? 'Submitted' : 'Approved';

  const [headerResult] = await connection.query(
    `
    INSERT INTO inventory_adjustments (
      adjustment_number,
      source_type,
      source_id,
      warehouse_id,
      adjustment_date,
      status,
      reason_code,
      remarks,
      total_qty_variance,
      total_value_variance,
      created_by,
      approved_by,
      approved_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      adjustmentNumber,
      source_type,
      source_id ? Number(source_id) : null,
      Number(warehouse_id),
      adjustment_date,
      initialStatus,
      reason_code,
      remarks,
      totalQtyVariance,
      totalValueVariance,
      userId ?? null,
      approvalRule ? null : userId ?? null,
      approvalRule ? null : new Date(),
    ]
  );

  const adjustmentId = headerResult.insertId;

  for (const item of items) {
    const qtyBefore = round4(item.quantity_before);
    const qtyAfter = round4(item.quantity_after);
    const varianceQty = round4(qtyAfter - qtyBefore);
    const unitCost = round4(item.unit_cost);
    const varianceValue = round4(varianceQty * unitCost);

    await connection.query(
      `
      INSERT INTO inventory_adjustment_items (
        inventory_adjustment_id,
        product_id,
        warehouse_id,
        bin_id,
        lot_id,
        quantity_before,
        quantity_after,
        quantity_variance,
        unit_cost,
        line_value_variance,
        reason_code,
        remarks
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        adjustmentId,
        Number(item.product_id),
        Number(warehouse_id),
        item.bin_id ? Number(item.bin_id) : null,
        item.lot_id ? Number(item.lot_id) : null,
        qtyBefore,
        qtyAfter,
        varianceQty,
        unitCost,
        varianceValue,
        item.reason_code || reason_code || null,
        item.remarks || null,
      ]
    );
  }

  if (approvalRule) {
    await connection.query(
      `
      INSERT INTO approval_transactions (
        module_code,
        transaction_type,
        reference_id,
        status,
        current_step,
        required_role,
        requested_by
      )
      VALUES ('INVENTORY', 'ADJUSTMENT', ?, 'Pending', 1, ?, ?)
      `,
      [adjustmentId, approvalRule.approver_role, userId ?? null]
    );
  }

  return {
    message: 'Inventory adjustment created successfully',
    id: adjustmentId,
    adjustment_number: adjustmentNumber,
    status: initialStatus,
  };
};

export const approveInventoryAdjustmentService = async (connection, adjustmentId, userId) => {
  const [[header]] = await connection.query(
    `
    SELECT *
    FROM inventory_adjustments
    WHERE id = ?
    FOR UPDATE
    `,
    [adjustmentId]
  );

  if (!header) {
    throw new Error('Inventory adjustment not found');
  }

  if (!['Submitted', 'Draft'].includes(header.status)) {
    throw new Error('Only submitted or draft inventory adjustments can be approved');
  }

  await connection.query(
    `
    UPDATE inventory_adjustments
    SET status = 'Approved',
        approved_by = ?,
        approved_at = NOW()
    WHERE id = ?
    `,
    [userId ?? null, adjustmentId]
  );

  await connection.query(
    `
    UPDATE approval_transactions
    SET status = 'Approved',
        approved_by = ?,
        approved_at = NOW()
    WHERE module_code = 'INVENTORY'
      AND transaction_type = 'ADJUSTMENT'
      AND reference_id = ?
      AND status = 'Pending'
    `,
    [userId ?? null, adjustmentId]
  );

  return { message: 'Inventory adjustment approved successfully' };
};

export const rejectInventoryAdjustmentService = async (
  connection,
  adjustmentId,
  userId,
  rejectionReason
) => {
  const [[header]] = await connection.query(
    `
    SELECT *
    FROM inventory_adjustments
    WHERE id = ?
    FOR UPDATE
    `,
    [adjustmentId]
  );

  if (!header) {
    throw new Error('Inventory adjustment not found');
  }

  if (!['Submitted', 'Draft'].includes(header.status)) {
    throw new Error('Only submitted or draft inventory adjustments can be rejected');
  }

  await connection.query(
    `
    UPDATE inventory_adjustments
    SET status = 'Rejected',
        rejected_by = ?,
        rejected_at = NOW(),
        rejection_reason = ?
    WHERE id = ?
    `,
    [userId ?? null, rejectionReason || null, adjustmentId]
  );

  await connection.query(
    `
    UPDATE approval_transactions
    SET status = 'Rejected',
        rejected_by = ?,
        rejected_at = NOW(),
        rejection_reason = ?
    WHERE module_code = 'INVENTORY'
      AND transaction_type = 'ADJUSTMENT'
      AND reference_id = ?
      AND status = 'Pending'
    `,
    [userId ?? null, rejectionReason || null, adjustmentId]
  );

  return { message: 'Inventory adjustment rejected successfully' };
};

export const postInventoryAdjustmentService = async (connection, adjustmentId, userId) => {
  const [[header]] = await connection.query(
    `
    SELECT *
    FROM inventory_adjustments
    WHERE id = ?
    FOR UPDATE
    `,
    [adjustmentId]
  );

  if (!header) {
    throw new Error('Inventory adjustment not found');
  }

  if (header.status !== 'Approved') {
    throw new Error('Only approved inventory adjustments can be posted');
  }

  const [items] = await connection.query(
    `
    SELECT *
    FROM inventory_adjustment_items
    WHERE inventory_adjustment_id = ?
    ORDER BY id ASC
    `,
    [adjustmentId]
  );

  if (!items.length) {
    throw new Error('Inventory adjustment has no items');
  }

  for (const item of items) {
    const qtyBefore = round4(item.quantity_before);
    const qtyAfter = round4(item.quantity_after);
    const qtyVariance = round4(item.quantity_variance);
    const unitCost = round4(item.unit_cost);
    const valueBefore = round4(qtyBefore * unitCost);
    const valueAfter = round4(qtyAfter * unitCost);

    const stockRow = await getOrCreateInventoryStockRowForUpdate(
      connection,
      item.product_id,
      header.warehouse_id
    );

    await updateInventoryStockSnapshot(connection, stockRow.id, {
      quantity: qtyAfter,
      reserved_quantity: round4(stockRow.reserved_quantity),
      available_quantity: recomputeAvailable({
        quantity: qtyAfter,
        reservedQuantity: round4(stockRow.reserved_quantity),
      }),
      unit_cost: qtyAfter === 0 ? 0 : unitCost,
      total_value: valueAfter,
    });

    if (item.bin_id) {
      const binStock = await getOrCreateInventoryBinStockRowForUpdate(
        connection,
        item.product_id,
        header.warehouse_id,
        item.bin_id
      );

      await updateInventoryBinStockSnapshot(connection, binStock.id, {
        quantity: qtyAfter,
        reserved_quantity: round4(binStock.reserved_quantity),
        available_quantity: recomputeAvailable({
          quantity: qtyAfter,
          reservedQuantity: round4(binStock.reserved_quantity),
        }),
        unit_cost,
        total_value: valueAfter,
      });
    }

    if (item.lot_id) {
      const lotStock = await getOrCreateInventoryLotStockRowForUpdate(
        connection,
        item.product_id,
        header.warehouse_id,
        item.bin_id || null,
        item.lot_id
      );

      await updateInventoryLotStockSnapshot(connection, lotStock.id, {
        quantity: qtyAfter,
        reserved_quantity: round4(lotStock.reserved_quantity),
        available_quantity: recomputeAvailable({
          quantity: qtyAfter,
          reservedQuantity: round4(lotStock.reserved_quantity),
        }),
        unit_cost,
        total_value: valueAfter,
      });
    }

    await insertInventoryLedger(connection, {
      posting_date: header.adjustment_date,
      reference_type: 'InventoryAdjustment',
      reference_id: header.id,
      reference_line_id: item.id,
      product_id: item.product_id,
      warehouse_id: header.warehouse_id,
      movement_type: qtyVariance >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      quantity_in: qtyVariance >= 0 ? round4(Math.abs(qtyVariance)) : 0,
      quantity_out: qtyVariance < 0 ? round4(Math.abs(qtyVariance)) : 0,
      unit_cost,
      line_total: round4(Math.abs(item.line_value_variance)),
      qty_before: qtyBefore,
      qty_after: qtyAfter,
      value_before: valueBefore,
      value_after: valueAfter,
      avg_cost_before: qtyBefore === 0 ? 0 : round4(valueBefore / qtyBefore),
      avg_cost_after: qtyAfter === 0 ? 0 : round4(valueAfter / qtyAfter),
      bin_id: item.bin_id || null,
      lot_id: item.lot_id || null,
      remarks: header.remarks || `Inventory adjustment ${header.adjustment_number}`,
      created_by: userId,
    });

    await syncProductWarehouseTotals(connection, item.product_id);
  }

  await connection.query(
    `
    UPDATE inventory_adjustments
    SET status = 'Posted',
        posted_by = ?,
        posted_at = NOW()
    WHERE id = ?
    `,
    [userId ?? null, adjustmentId]
  );

  return { message: 'Inventory adjustment posted successfully' };
};