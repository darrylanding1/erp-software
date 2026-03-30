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

const getNextTransferNumber = async (connection) => {
  const [rows] = await connection.query(
    `
    SELECT transfer_number
    FROM stock_transfers
    ORDER BY id DESC
    LIMIT 1
    `
  );

  if (!rows.length || !rows[0].transfer_number) {
    return 'TRF-00001';
  }

  const currentNumber = rows[0].transfer_number;
  const numericPart = Number(String(currentNumber).split('-').pop() || 0) + 1;

  return `TRF-${String(numericPart).padStart(5, '0')}`;
};

export const getStockTransfersService = async (filters = {}) => {
  const {
    status = '',
    from_warehouse_id = '',
    to_warehouse_id = '',
    date_from = '',
    date_to = '',
    search = '',
  } = filters;

  let sql = `
    SELECT
      st.*,
      fw.name AS from_warehouse_name,
      fw.code AS from_warehouse_code,
      tw.name AS to_warehouse_name,
      tw.code AS to_warehouse_code,
      fbin.bin_code AS from_bin_code,
      tbin.bin_code AS to_bin_code,
      creator.full_name AS created_by_name,
      approver.full_name AS approved_by_name,
      poster.full_name AS posted_by_name,
      COUNT(sti.id) AS item_count,
      COALESCE(SUM(sti.quantity), 0) AS total_quantity
    FROM stock_transfers st
    INNER JOIN warehouses fw
      ON fw.id = st.from_warehouse_id
    INNER JOIN warehouses tw
      ON tw.id = st.to_warehouse_id
    LEFT JOIN warehouse_bins fbin
      ON fbin.id = st.from_bin_id
    LEFT JOIN warehouse_bins tbin
      ON tbin.id = st.to_bin_id
    LEFT JOIN users creator
      ON creator.id = st.created_by
    LEFT JOIN users approver
      ON approver.id = st.approved_by
    LEFT JOIN users poster
      ON poster.id = st.posted_by
    LEFT JOIN stock_transfer_items sti
      ON sti.stock_transfer_id = st.id
    WHERE 1 = 1
  `;
  const values = [];

  if (status) {
    sql += ` AND st.status = ?`;
    values.push(status);
  }

  if (from_warehouse_id) {
    sql += ` AND st.from_warehouse_id = ?`;
    values.push(Number(from_warehouse_id));
  }

  if (to_warehouse_id) {
    sql += ` AND st.to_warehouse_id = ?`;
    values.push(Number(to_warehouse_id));
  }

  if (date_from) {
    sql += ` AND st.transfer_date >= ?`;
    values.push(date_from);
  }

  if (date_to) {
    sql += ` AND st.transfer_date <= ?`;
    values.push(date_to);
  }

  if (search) {
    sql += ` AND (st.transfer_number LIKE ? OR st.remarks LIKE ?)`;
    values.push(`%${search}%`, `%${search}%`);
  }

  sql += `
    GROUP BY st.id
    ORDER BY st.id DESC
  `;

  const [rows] = await db.query(sql, values);
  return rows;
};

export const getStockTransferByIdService = async (id) => {
  const [[header]] = await db.query(
    `
    SELECT
      st.*,
      fw.name AS from_warehouse_name,
      fw.code AS from_warehouse_code,
      tw.name AS to_warehouse_name,
      tw.code AS to_warehouse_code,
      fbin.bin_code AS from_bin_code,
      tbin.bin_code AS to_bin_code
    FROM stock_transfers st
    INNER JOIN warehouses fw
      ON fw.id = st.from_warehouse_id
    INNER JOIN warehouses tw
      ON tw.id = st.to_warehouse_id
    LEFT JOIN warehouse_bins fbin
      ON fbin.id = st.from_bin_id
    LEFT JOIN warehouse_bins tbin
      ON tbin.id = st.to_bin_id
    WHERE st.id = ?
    `,
    [id]
  );

  if (!header) return null;

  const [items] = await db.query(
    `
    SELECT
      sti.*,
      p.name AS product_name,
      p.sku,
      fbin.bin_code AS from_bin_code,
      tbin.bin_code AS to_bin_code,
      l.lot_number,
      l.batch_number
    FROM stock_transfer_items sti
    INNER JOIN products p
      ON p.id = sti.product_id
    LEFT JOIN warehouse_bins fbin
      ON fbin.id = sti.from_bin_id
    LEFT JOIN warehouse_bins tbin
      ON tbin.id = sti.to_bin_id
    LEFT JOIN inventory_lots l
      ON l.id = sti.lot_id
    WHERE sti.stock_transfer_id = ?
    ORDER BY sti.id ASC
    `,
    [id]
  );

  for (const item of items) {
    const [serials] = await db.query(
      `
      SELECT
        stis.id,
        stis.serial_id,
        s.serial_number
      FROM stock_transfer_item_serials stis
      INNER JOIN inventory_serials s
        ON s.id = stis.serial_id
      WHERE stis.stock_transfer_item_id = ?
      ORDER BY stis.id ASC
      `,
      [item.id]
    );

    item.serials = serials;
  }

  header.items = items;
  return header;
};

export const createStockTransferService = async (connection, payload, userId) => {
  const {
    transfer_date,
    from_warehouse_id,
    from_bin_id = null,
    to_warehouse_id,
    to_bin_id = null,
    remarks = null,
    items = [],
  } = payload;

  if (!transfer_date || !from_warehouse_id || !to_warehouse_id) {
    throw new Error('transfer_date, from_warehouse_id, and to_warehouse_id are required');
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one transfer item is required');
  }

  const transferNumber = await getNextTransferNumber(connection);

  const [result] = await connection.query(
    `
    INSERT INTO stock_transfers (
      transfer_number,
      transfer_date,
      from_warehouse_id,
      from_bin_id,
      to_warehouse_id,
      to_bin_id,
      status,
      remarks,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, 'Draft', ?, ?)
    `,
    [
      transferNumber,
      transfer_date,
      Number(from_warehouse_id),
      from_bin_id ? Number(from_bin_id) : null,
      Number(to_warehouse_id),
      to_bin_id ? Number(to_bin_id) : null,
      remarks,
      userId ?? null,
    ]
  );

  const transferId = result.insertId;

  for (const item of items) {
    const qty = round4(item.quantity);

    if (!item.product_id || qty <= 0) {
      throw new Error('Each transfer item must have product_id and quantity > 0');
    }

    const unitCost = round4(item.unit_cost || 0);
    const lineTotal = round4(qty * unitCost);

    const [itemResult] = await connection.query(
      `
      INSERT INTO stock_transfer_items (
        stock_transfer_id,
        product_id,
        from_bin_id,
        to_bin_id,
        lot_id,
        quantity,
        unit_cost,
        line_total
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        transferId,
        Number(item.product_id),
        item.from_bin_id ? Number(item.from_bin_id) : from_bin_id ? Number(from_bin_id) : null,
        item.to_bin_id ? Number(item.to_bin_id) : to_bin_id ? Number(to_bin_id) : null,
        item.lot_id ? Number(item.lot_id) : null,
        qty,
        unitCost,
        lineTotal,
      ]
    );

    if (Array.isArray(item.serial_ids) && item.serial_ids.length > 0) {
      for (const serialId of item.serial_ids) {
        await connection.query(
          `
          INSERT INTO stock_transfer_item_serials (
            stock_transfer_item_id,
            serial_id
          )
          VALUES (?, ?)
          `,
          [itemResult.insertId, Number(serialId)]
        );
      }
    }
  }

  return {
    message: 'Stock transfer created successfully',
    id: transferId,
    transfer_number: transferNumber,
  };
};

export const approveStockTransferService = async (connection, transferId, userId) => {
  const [[transfer]] = await connection.query(
    `
    SELECT *
    FROM stock_transfers
    WHERE id = ?
    FOR UPDATE
    `,
    [transferId]
  );

  if (!transfer) {
    throw new Error('Stock transfer not found');
  }

  if (transfer.status !== 'Draft') {
    throw new Error('Only draft stock transfers can be approved');
  }

  await connection.query(
    `
    UPDATE stock_transfers
    SET status = 'Approved',
        approved_by = ?,
        approved_at = NOW()
    WHERE id = ?
    `,
    [userId ?? null, transferId]
  );

  return { message: 'Stock transfer approved successfully' };
};

export const postStockTransferService = async (connection, transferId, userId) => {
  const [[transfer]] = await connection.query(
    `
    SELECT *
    FROM stock_transfers
    WHERE id = ?
    FOR UPDATE
    `,
    [transferId]
  );

  if (!transfer) {
    throw new Error('Stock transfer not found');
  }

  if (!['Draft', 'Approved'].includes(transfer.status)) {
    throw new Error('Only draft or approved transfers can be posted');
  }

  const [items] = await connection.query(
    `
    SELECT *
    FROM stock_transfer_items
    WHERE stock_transfer_id = ?
    ORDER BY id ASC
    `,
    [transferId]
  );

  if (!items.length) {
    throw new Error('Stock transfer has no items');
  }

  for (const item of items) {
    const qty = round4(item.quantity);

    const fromWarehouseStock = await getOrCreateInventoryStockRowForUpdate(
      connection,
      item.product_id,
      transfer.from_warehouse_id
    );

    const toWarehouseStock = await getOrCreateInventoryStockRowForUpdate(
      connection,
      item.product_id,
      transfer.to_warehouse_id
    );

    const availableSourceQty = round4(
      fromWarehouseStock.available_quantity ?? fromWarehouseStock.quantity
    );

    if (qty > availableSourceQty) {
      throw new Error(`Insufficient available stock for product ${item.product_id}`);
    }

    const unitCost = round4(item.unit_cost || fromWarehouseStock.unit_cost || 0);
    const lineTotal = round4(qty * unitCost);

    const fromQtyBefore = round4(fromWarehouseStock.quantity);
    const fromValBefore = round4(fromWarehouseStock.total_value);
    const fromQtyAfter = round4(fromQtyBefore - qty);
    const fromValAfter = round4(fromValBefore - lineTotal);

    const toQtyBefore = round4(toWarehouseStock.quantity);
    const toValBefore = round4(toWarehouseStock.total_value);
    const toQtyAfter = round4(toQtyBefore + qty);
    const toValAfter = round4(toValBefore + lineTotal);

    await updateInventoryStockSnapshot(connection, fromWarehouseStock.id, {
      quantity: fromQtyAfter,
      reserved_quantity: round4(fromWarehouseStock.reserved_quantity),
      available_quantity: recomputeAvailable({
        quantity: fromQtyAfter,
        reservedQuantity: round4(fromWarehouseStock.reserved_quantity),
      }),
      unit_cost: fromQtyAfter === 0 ? 0 : round4(fromValAfter / fromQtyAfter),
      total_value: fromValAfter,
    });

    await updateInventoryStockSnapshot(connection, toWarehouseStock.id, {
      quantity: toQtyAfter,
      reserved_quantity: round4(toWarehouseStock.reserved_quantity),
      available_quantity: recomputeAvailable({
        quantity: toQtyAfter,
        reservedQuantity: round4(toWarehouseStock.reserved_quantity),
      }),
      unit_cost: toQtyAfter === 0 ? 0 : round4(toValAfter / toQtyAfter),
      total_value: toValAfter,
    });

    if (item.from_bin_id) {
      const fromBinStock = await getOrCreateInventoryBinStockRowForUpdate(
        connection,
        item.product_id,
        transfer.from_warehouse_id,
        item.from_bin_id
      );

      const fromBinQtyAfter = round4(Number(fromBinStock.quantity) - qty);
      const fromBinValueAfter = round4(fromBinQtyAfter * unitCost);

      await updateInventoryBinStockSnapshot(connection, fromBinStock.id, {
        quantity: fromBinQtyAfter,
        reserved_quantity: round4(fromBinStock.reserved_quantity),
        available_quantity: recomputeAvailable({
          quantity: fromBinQtyAfter,
          reservedQuantity: round4(fromBinStock.reserved_quantity),
        }),
        unit_cost: unitCost,
        total_value: fromBinValueAfter,
      });
    }

    if (item.to_bin_id) {
      const toBinStock = await getOrCreateInventoryBinStockRowForUpdate(
        connection,
        item.product_id,
        transfer.to_warehouse_id,
        item.to_bin_id
      );

      const toBinQtyAfter = round4(Number(toBinStock.quantity) + qty);
      const toBinValueAfter = round4(toBinQtyAfter * unitCost);

      await updateInventoryBinStockSnapshot(connection, toBinStock.id, {
        quantity: toBinQtyAfter,
        reserved_quantity: round4(toBinStock.reserved_quantity),
        available_quantity: recomputeAvailable({
          quantity: toBinQtyAfter,
          reservedQuantity: round4(toBinStock.reserved_quantity),
        }),
        unit_cost: unitCost,
        total_value: toBinValueAfter,
      });
    }

    if (item.lot_id) {
      const fromLotStock = await getOrCreateInventoryLotStockRowForUpdate(
        connection,
        item.product_id,
        transfer.from_warehouse_id,
        item.from_bin_id || transfer.from_bin_id || null,
        item.lot_id
      );

      const toLotStock = await getOrCreateInventoryLotStockRowForUpdate(
        connection,
        item.product_id,
        transfer.to_warehouse_id,
        item.to_bin_id || transfer.to_bin_id || null,
        item.lot_id
      );

      const fromLotQtyAfter = round4(Number(fromLotStock.quantity) - qty);
      const toLotQtyAfter = round4(Number(toLotStock.quantity) + qty);

      await updateInventoryLotStockSnapshot(connection, fromLotStock.id, {
        quantity: fromLotQtyAfter,
        reserved_quantity: round4(fromLotStock.reserved_quantity),
        available_quantity: recomputeAvailable({
          quantity: fromLotQtyAfter,
          reservedQuantity: round4(fromLotStock.reserved_quantity),
        }),
        unit_cost: unitCost,
        total_value: round4(fromLotQtyAfter * unitCost),
      });

      await updateInventoryLotStockSnapshot(connection, toLotStock.id, {
        quantity: toLotQtyAfter,
        reserved_quantity: round4(toLotStock.reserved_quantity),
        available_quantity: recomputeAvailable({
          quantity: toLotQtyAfter,
          reservedQuantity: round4(toLotStock.reserved_quantity),
        }),
        unit_cost: unitCost,
        total_value: round4(toLotQtyAfter * unitCost),
      });
    }

    const [serialRows] = await connection.query(
      `
      SELECT serial_id
      FROM stock_transfer_item_serials
      WHERE stock_transfer_item_id = ?
      ORDER BY id ASC
      `,
      [item.id]
    );

    for (const serialRow of serialRows) {
      await connection.query(
        `
        UPDATE inventory_serials
        SET warehouse_id = ?,
            bin_id = ?,
            status = 'IN_STOCK'
        WHERE id = ?
        `,
        [
          transfer.to_warehouse_id,
          item.to_bin_id || transfer.to_bin_id || null,
          serialRow.serial_id,
        ]
      );
    }

    await insertInventoryLedger(connection, {
      posting_date: transfer.transfer_date,
      reference_type: 'StockTransfer',
      reference_id: transfer.id,
      reference_line_id: item.id,
      product_id: item.product_id,
      warehouse_id: transfer.from_warehouse_id,
      movement_type: 'TRANSFER_OUT',
      quantity_in: 0,
      quantity_out: qty,
      unit_cost,
      line_total: lineTotal,
      qty_before: fromQtyBefore,
      qty_after: fromQtyAfter,
      value_before: fromValBefore,
      value_after: fromValAfter,
      avg_cost_before: fromQtyBefore === 0 ? 0 : round4(fromValBefore / fromQtyBefore),
      avg_cost_after: fromQtyAfter === 0 ? 0 : round4(fromValAfter / fromQtyAfter),
      bin_id: item.from_bin_id || transfer.from_bin_id || null,
      lot_id: item.lot_id || null,
      source_warehouse_id: transfer.from_warehouse_id,
      source_bin_id: item.from_bin_id || transfer.from_bin_id || null,
      destination_warehouse_id: transfer.to_warehouse_id,
      destination_bin_id: item.to_bin_id || transfer.to_bin_id || null,
      remarks: `Transfer out ${transfer.transfer_number}`,
      created_by: userId,
    });

    await insertInventoryLedger(connection, {
      posting_date: transfer.transfer_date,
      reference_type: 'StockTransfer',
      reference_id: transfer.id,
      reference_line_id: item.id,
      product_id: item.product_id,
      warehouse_id: transfer.to_warehouse_id,
      movement_type: 'TRANSFER_IN',
      quantity_in: qty,
      quantity_out: 0,
      unit_cost,
      line_total: lineTotal,
      qty_before: toQtyBefore,
      qty_after: toQtyAfter,
      value_before: toValBefore,
      value_after: toValAfter,
      avg_cost_before: toQtyBefore === 0 ? 0 : round4(toValBefore / toQtyBefore),
      avg_cost_after: toQtyAfter === 0 ? 0 : round4(toValAfter / toQtyAfter),
      bin_id: item.to_bin_id || transfer.to_bin_id || null,
      lot_id: item.lot_id || null,
      source_warehouse_id: transfer.from_warehouse_id,
      source_bin_id: item.from_bin_id || transfer.from_bin_id || null,
      destination_warehouse_id: transfer.to_warehouse_id,
      destination_bin_id: item.to_bin_id || transfer.to_bin_id || null,
      remarks: `Transfer in ${transfer.transfer_number}`,
      created_by: userId,
    });

    await syncProductWarehouseTotals(connection, item.product_id);
  }

  await connection.query(
    `
    UPDATE stock_transfers
    SET status = 'Posted',
        posted_at = NOW(),
        posted_by = ?
    WHERE id = ?
    `,
    [userId ?? null, transferId]
  );

  return { message: 'Stock transfer posted successfully' };
};

export const cancelStockTransferService = async (
  connection,
  transferId,
  userId,
  cancellationReason = null
) => {
  const [[transfer]] = await connection.query(
    `
    SELECT *
    FROM stock_transfers
    WHERE id = ?
    FOR UPDATE
    `,
    [transferId]
  );

  if (!transfer) {
    throw new Error('Stock transfer not found');
  }

  if (transfer.status === 'Posted') {
    throw new Error('Posted stock transfers cannot be cancelled');
  }

  if (transfer.status === 'Cancelled') {
    throw new Error('Stock transfer is already cancelled');
  }

  await connection.query(
    `
    UPDATE stock_transfers
    SET status = 'Cancelled',
        cancelled_by = ?,
        cancelled_at = NOW(),
        cancellation_reason = ?
    WHERE id = ?
    `,
    [userId ?? null, cancellationReason, transferId]
  );

  return { message: 'Stock transfer cancelled successfully' };
};