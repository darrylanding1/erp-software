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

const getNextCountNumber = async (connection) => {
  const [rows] = await connection.query(
    `
    SELECT count_number
    FROM stock_counts
    ORDER BY id DESC
    LIMIT 1
    `
  );

  if (!rows.length || !rows[0].count_number) {
    return 'CNT-00001';
  }

  const currentNumber = rows[0].count_number;
  const numericPart = Number(String(currentNumber).split('-').pop() || 0) + 1;

  return `CNT-${String(numericPart).padStart(5, '0')}`;
};

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

export const getStockCountMetaService = async () => {
  const [warehouses] = await db.query(
    `
    SELECT id, code, name, status
    FROM warehouses
    WHERE status = 'Active'
    ORDER BY name ASC
    `
  );

  const [bins] = await db.query(
    `
    SELECT id, warehouse_id, bin_code, bin_name, is_active
    FROM warehouse_bins
    WHERE is_active = 1
    ORDER BY warehouse_id ASC, bin_code ASC
    `
  );

  const [products] = await db.query(
    `
    SELECT id, sku, name
    FROM products
    ORDER BY name ASC
    `
  );

  return { warehouses, bins, products };
};

export const getStockCountsService = async (filters = {}) => {
  const {
    status = '',
    warehouse_id = '',
    date_from = '',
    date_to = '',
    search = '',
  } = filters;

  let sql = `
    SELECT
      sc.*,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      b.bin_code,
      creator.full_name AS created_by_name,
      approver.full_name AS approved_by_name,
      poster.full_name AS posted_by_name,
      COUNT(sci.id) AS item_count,
      COALESCE(SUM(sci.variance_quantity), 0) AS total_variance_quantity,
      COALESCE(SUM(sci.variance_value), 0) AS total_variance_value
    FROM stock_counts sc
    INNER JOIN warehouses w
      ON w.id = sc.warehouse_id
    LEFT JOIN warehouse_bins b
      ON b.id = sc.bin_id
    LEFT JOIN users creator
      ON creator.id = sc.created_by
    LEFT JOIN users approver
      ON approver.id = sc.approved_by
    LEFT JOIN users poster
      ON poster.id = sc.posted_by
    LEFT JOIN stock_count_items sci
      ON sci.stock_count_id = sc.id
    WHERE 1 = 1
  `;
  const values = [];

  if (status) {
    sql += ` AND sc.status = ?`;
    values.push(status);
  }

  if (warehouse_id) {
    sql += ` AND sc.warehouse_id = ?`;
    values.push(Number(warehouse_id));
  }

  if (date_from) {
    sql += ` AND sc.count_date >= ?`;
    values.push(date_from);
  }

  if (date_to) {
    sql += ` AND sc.count_date <= ?`;
    values.push(date_to);
  }

  if (search) {
    sql += ` AND (sc.count_number LIKE ? OR sc.remarks LIKE ?)`;
    values.push(`%${search}%`, `%${search}%`);
  }

  sql += ` GROUP BY sc.id ORDER BY sc.id DESC`;

  const [rows] = await db.query(sql, values);
  return rows;
};

export const getStockCountByIdService = async (id) => {
  const [[header]] = await db.query(
    `
    SELECT
      sc.*,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      b.bin_code
    FROM stock_counts sc
    INNER JOIN warehouses w
      ON w.id = sc.warehouse_id
    LEFT JOIN warehouse_bins b
      ON b.id = sc.bin_id
    WHERE sc.id = ?
    `,
    [id]
  );

  if (!header) return null;

  const [items] = await db.query(
    `
    SELECT
      sci.*,
      p.name AS product_name,
      p.sku,
      wb.bin_code,
      l.lot_number,
      l.batch_number
    FROM stock_count_items sci
    INNER JOIN products p
      ON p.id = sci.product_id
    LEFT JOIN warehouse_bins wb
      ON wb.id = sci.bin_id
    LEFT JOIN inventory_lots l
      ON l.id = sci.lot_id
    WHERE sci.stock_count_id = ?
    ORDER BY sci.id ASC
    `,
    [id]
  );

  header.items = items;
  return header;
};

export const createStockCountService = async (connection, payload, userId) => {
  const {
    warehouse_id,
    bin_id = null,
    count_date,
    count_scope = 'WAREHOUSE',
    remarks = null,
    items = [],
  } = payload;

  if (!warehouse_id || !count_date) {
    throw new Error('warehouse_id and count_date are required');
  }

  const countNumber = await getNextCountNumber(connection);

  const [headerResult] = await connection.query(
    `
    INSERT INTO stock_counts (
      count_number,
      warehouse_id,
      bin_id,
      count_date,
      status,
      count_scope,
      remarks,
      created_by
    )
    VALUES (?, ?, ?, ?, 'Draft', ?, ?, ?)
    `,
    [
      countNumber,
      Number(warehouse_id),
      bin_id ? Number(bin_id) : null,
      count_date,
      count_scope,
      remarks,
      userId ?? null,
    ]
  );

  const stockCountId = headerResult.insertId;

  if (Array.isArray(items) && items.length > 0) {
    for (const item of items) {
      const systemQty = round4(item.system_quantity);
      const countedQty = round4(item.counted_quantity);
      const varianceQty = round4(countedQty - systemQty);
      const unitCost = round4(item.unit_cost || 0);
      const varianceValue = round4(varianceQty * unitCost);

      await connection.query(
        `
        INSERT INTO stock_count_items (
          stock_count_id,
          product_id,
          bin_id,
          lot_id,
          system_quantity,
          counted_quantity,
          variance_quantity,
          unit_cost,
          variance_value,
          reason_code,
          remarks
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          stockCountId,
          Number(item.product_id),
          item.bin_id ? Number(item.bin_id) : bin_id ? Number(bin_id) : null,
          item.lot_id ? Number(item.lot_id) : null,
          systemQty,
          countedQty,
          varianceQty,
          unitCost,
          varianceValue,
          item.reason_code || null,
          item.remarks || null,
        ]
      );
    }
  } else {
    let stockRows = [];

    if (bin_id) {
      const [rows] = await connection.query(
        `
        SELECT
          ibs.product_id,
          ibs.bin_id,
          NULL AS lot_id,
          ibs.quantity AS system_quantity,
          ibs.unit_cost
        FROM inventory_bin_stocks ibs
        WHERE ibs.warehouse_id = ?
          AND ibs.bin_id = ?
          AND ibs.quantity <> 0
        ORDER BY ibs.product_id ASC
        `,
        [Number(warehouse_id), Number(bin_id)]
      );

      stockRows = rows;
    } else {
      const [rows] = await connection.query(
        `
        SELECT
          is1.product_id,
          NULL AS bin_id,
          NULL AS lot_id,
          is1.quantity AS system_quantity,
          is1.unit_cost
        FROM inventory_stocks is1
        WHERE is1.warehouse_id = ?
          AND is1.quantity <> 0
        ORDER BY is1.product_id ASC
        `,
        [Number(warehouse_id)]
      );

      stockRows = rows;
    }

    for (const row of stockRows) {
      await connection.query(
        `
        INSERT INTO stock_count_items (
          stock_count_id,
          product_id,
          bin_id,
          lot_id,
          system_quantity,
          counted_quantity,
          variance_quantity,
          unit_cost,
          variance_value
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)
        `,
        [
          stockCountId,
          Number(row.product_id),
          row.bin_id ? Number(row.bin_id) : null,
          row.lot_id ? Number(row.lot_id) : null,
          round4(row.system_quantity),
          round4(row.system_quantity),
          round4(row.unit_cost),
        ]
      );
    }
  }

  return {
    message: 'Stock count created successfully',
    id: stockCountId,
    count_number: countNumber,
  };
};

export const submitStockCountService = async (connection, stockCountId) => {
  const [[header]] = await connection.query(
    `
    SELECT *
    FROM stock_counts
    WHERE id = ?
    FOR UPDATE
    `,
    [stockCountId]
  );

  if (!header) {
    throw new Error('Stock count not found');
  }

  if (header.status !== 'Draft') {
    throw new Error('Only draft stock counts can be submitted');
  }

  const [items] = await connection.query(
    `
    SELECT *
    FROM stock_count_items
    WHERE stock_count_id = ?
    ORDER BY id ASC
    `,
    [stockCountId]
  );

  if (!items.length) {
    throw new Error('Stock count has no items');
  }

  let totalVarianceQty = 0;
  let totalVarianceValue = 0;

  for (const item of items) {
    const systemQty = round4(item.system_quantity);
    const countedQty = round4(item.counted_quantity);
    const varianceQty = round4(countedQty - systemQty);
    const varianceValue = round4(varianceQty * round4(item.unit_cost));

    totalVarianceQty = round4(totalVarianceQty + varianceQty);
    totalVarianceValue = round4(totalVarianceValue + varianceValue);

    await connection.query(
      `
      UPDATE stock_count_items
      SET variance_quantity = ?,
          variance_value = ?
      WHERE id = ?
      `,
      [varianceQty, varianceValue, item.id]
    );
  }

  await connection.query(
    `
    UPDATE stock_counts
    SET status = 'Submitted'
    WHERE id = ?
    `,
    [stockCountId]
  );

  return {
    message: 'Stock count submitted successfully',
    total_variance_quantity: totalVarianceQty,
    total_variance_value: totalVarianceValue,
  };
};

export const approveStockCountService = async (connection, stockCountId, userId) => {
  const [[header]] = await connection.query(
    `
    SELECT *
    FROM stock_counts
    WHERE id = ?
    FOR UPDATE
    `,
    [stockCountId]
  );

  if (!header) {
    throw new Error('Stock count not found');
  }

  if (header.status !== 'Submitted') {
    throw new Error('Only submitted stock counts can be approved');
  }

  await connection.query(
    `
    UPDATE stock_counts
    SET status = 'Approved',
        approved_by = ?,
        approved_at = NOW()
    WHERE id = ?
    `,
    [userId ?? null, stockCountId]
  );

  return { message: 'Stock count approved successfully' };
};

export const postStockCountService = async (connection, stockCountId, userId) => {
  const [[header]] = await connection.query(
    `
    SELECT *
    FROM stock_counts
    WHERE id = ?
    FOR UPDATE
    `,
    [stockCountId]
  );

  if (!header) {
    throw new Error('Stock count not found');
  }

  if (header.status !== 'Approved') {
    throw new Error('Only approved stock counts can be posted');
  }

  const [items] = await connection.query(
    `
    SELECT *
    FROM stock_count_items
    WHERE stock_count_id = ?
    ORDER BY id ASC
    `,
    [stockCountId]
  );

  if (!items.length) {
    throw new Error('Stock count has no items');
  }

  const adjustmentNumber = await getNextAdjustmentNumber(connection);

  let totalQtyVariance = 0;
  let totalValueVariance = 0;

  const [adjustmentResult] = await connection.query(
    `
    INSERT INTO inventory_adjustments (
      adjustment_number,
      source_type,
      source_id,
      warehouse_id,
      adjustment_date,
      status,
      remarks,
      total_qty_variance,
      total_value_variance,
      created_by,
      approved_by,
      approved_at,
      posted_by,
      posted_at
    )
    VALUES (?, 'STOCK_COUNT', ?, ?, ?, 'Posted', ?, 0, 0, ?, ?, NOW(), ?, NOW())
    `,
    [
      adjustmentNumber,
      stockCountId,
      header.warehouse_id,
      header.count_date,
      `Auto-created from stock count ${header.count_number}`,
      header.created_by ?? null,
      header.approved_by ?? userId ?? null,
      userId ?? null,
    ]
  );

  const adjustmentId = adjustmentResult.insertId;

  for (const item of items) {
    const varianceQty = round4(item.variance_quantity);
    const unitCost = round4(item.unit_cost);
    const varianceValue = round4(item.variance_value);

    totalQtyVariance = round4(totalQtyVariance + varianceQty);
    totalValueVariance = round4(totalValueVariance + varianceValue);

    const stockRow = await getOrCreateInventoryStockRowForUpdate(
      connection,
      item.product_id,
      header.warehouse_id
    );

    const qtyBefore = round4(stockRow.quantity);
    const valueBefore = round4(stockRow.total_value);
    const qtyAfter = round4(item.counted_quantity);
    const valueAfter = round4(qtyAfter * unitCost);

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
        quantity: round4(item.counted_quantity),
        reserved_quantity: round4(binStock.reserved_quantity),
        available_quantity: recomputeAvailable({
          quantity: round4(item.counted_quantity),
          reservedQuantity: round4(binStock.reserved_quantity),
        }),
        unit_cost,
        total_value: round4(round4(item.counted_quantity) * unitCost),
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
        quantity: round4(item.counted_quantity),
        reserved_quantity: round4(lotStock.reserved_quantity),
        available_quantity: recomputeAvailable({
          quantity: round4(item.counted_quantity),
          reservedQuantity: round4(lotStock.reserved_quantity),
        }),
        unit_cost,
        total_value: round4(round4(item.counted_quantity) * unitCost),
      });
    }

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
        item.product_id,
        header.warehouse_id,
        item.bin_id || null,
        item.lot_id || null,
        round4(item.system_quantity),
        round4(item.counted_quantity),
        varianceQty,
        unitCost,
        varianceValue,
        item.reason_code || null,
        item.remarks || null,
      ]
    );

    await insertInventoryLedger(connection, {
      posting_date: header.count_date,
      reference_type: 'InventoryAdjustment',
      reference_id: adjustmentId,
      reference_line_id: item.id,
      product_id: item.product_id,
      warehouse_id: header.warehouse_id,
      movement_type: varianceQty >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      quantity_in: varianceQty >= 0 ? round4(Math.abs(varianceQty)) : 0,
      quantity_out: varianceQty < 0 ? round4(Math.abs(varianceQty)) : 0,
      unit_cost: unitCost,
      line_total: round4(Math.abs(varianceValue)),
      qty_before: qtyBefore,
      qty_after: qtyAfter,
      value_before: valueBefore,
      value_after: valueAfter,
      avg_cost_before: qtyBefore === 0 ? 0 : round4(valueBefore / qtyBefore),
      avg_cost_after: qtyAfter === 0 ? 0 : round4(valueAfter / qtyAfter),
      bin_id: item.bin_id || null,
      lot_id: item.lot_id || null,
      remarks: `Stock count posting ${header.count_number}`,
      created_by: userId,
    });

    await syncProductWarehouseTotals(connection, item.product_id);
  }

  await connection.query(
    `
    UPDATE inventory_adjustments
    SET total_qty_variance = ?,
        total_value_variance = ?
    WHERE id = ?
    `,
    [totalQtyVariance, totalValueVariance, adjustmentId]
  );

  await connection.query(
    `
    UPDATE stock_counts
    SET status = 'Posted',
        posted_by = ?,
        posted_at = NOW()
    WHERE id = ?
    `,
    [userId ?? null, stockCountId]
  );

  return {
    message: 'Stock count posted successfully',
    inventory_adjustment_id: adjustmentId,
    adjustment_number: adjustmentNumber,
  };
};

export const cancelStockCountService = async (
  connection,
  stockCountId,
  userId,
  cancellationReason = null
) => {
  const [[header]] = await connection.query(
    `
    SELECT *
    FROM stock_counts
    WHERE id = ?
    FOR UPDATE
    `,
    [stockCountId]
  );

  if (!header) {
    throw new Error('Stock count not found');
  }

  if (header.status === 'Posted') {
    throw new Error('Posted stock counts cannot be cancelled');
  }

  if (header.status === 'Cancelled') {
    throw new Error('Stock count is already cancelled');
  }

  await connection.query(
    `
    UPDATE stock_counts
    SET status = 'Cancelled',
        cancelled_by = ?,
        cancelled_at = NOW(),
        cancellation_reason = ?
    WHERE id = ?
    `,
    [userId ?? null, cancellationReason, stockCountId]
  );

  return { message: 'Stock count cancelled successfully' };
};