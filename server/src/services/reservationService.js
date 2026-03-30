import db from '../config/db.js';
import {
  getOrCreateInventoryStockRowForUpdate,
  getOrCreateInventoryBinStockRowForUpdate,
  getOrCreateInventoryLotStockRowForUpdate,
  updateInventoryStockSnapshot,
  updateInventoryBinStockSnapshot,
  updateInventoryLotStockSnapshot,
  recomputeAvailable,
} from './stockDimensionService.js';
import { round4 } from '../utils/number.js';

const getNextReservationNumber = async (connection) => {
  const [rows] = await connection.query(
    `
    SELECT reservation_number
    FROM inventory_reservations
    ORDER BY id DESC
    LIMIT 1
    `
  );

  if (!rows.length || !rows[0].reservation_number) {
    return 'RSV-00001';
  }

  const currentNumber = rows[0].reservation_number;
  const numericPart = Number(String(currentNumber).split('-').pop() || 0) + 1;

  return `RSV-${String(numericPart).padStart(5, '0')}`;
};

export const getReservationMetaService = async () => {
  const [warehouses] = await db.query(
    `
    SELECT id, code, name, status
    FROM warehouses
    WHERE status = 'Active'
    ORDER BY name ASC
    `
  );

  const [products] = await db.query(
    `
    SELECT id, sku, name, quantity
    FROM products
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

  return { warehouses, products, bins };
};

export const getReservationsService = async (filters = {}) => {
  const {
    status = '',
    warehouse_id = '',
    product_id = '',
    source_type = '',
    search = '',
  } = filters;

  let sql = `
    SELECT
      r.*,
      p.name AS product_name,
      p.sku,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      b.bin_code,
      l.lot_number,
      s.serial_number,
      creator.full_name AS created_by_name
    FROM inventory_reservations r
    INNER JOIN products p
      ON p.id = r.product_id
    INNER JOIN warehouses w
      ON w.id = r.warehouse_id
    LEFT JOIN warehouse_bins b
      ON b.id = r.bin_id
    LEFT JOIN inventory_lots l
      ON l.id = r.lot_id
    LEFT JOIN inventory_serials s
      ON s.id = r.serial_id
    LEFT JOIN users creator
      ON creator.id = r.created_by
    WHERE 1 = 1
  `;
  const values = [];

  if (status) {
    sql += ` AND r.status = ?`;
    values.push(status);
  }

  if (warehouse_id) {
    sql += ` AND r.warehouse_id = ?`;
    values.push(Number(warehouse_id));
  }

  if (product_id) {
    sql += ` AND r.product_id = ?`;
    values.push(Number(product_id));
  }

  if (source_type) {
    sql += ` AND r.source_type = ?`;
    values.push(source_type);
  }

  if (search) {
    sql += ` AND (r.reservation_number LIKE ? OR p.name LIKE ? OR p.sku LIKE ?)`;
    values.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY r.id DESC`;

  const [rows] = await db.query(sql, values);
  return rows;
};

export const createReservationService = async (connection, payload, userId) => {
  const {
    source_type = 'SALES_ORDER',
    source_id,
    source_line_id = null,
    product_id,
    warehouse_id,
    bin_id = null,
    lot_id = null,
    serial_id = null,
    reserved_quantity,
    reservation_date,
    expiry_date = null,
    remarks = null,
  } = payload;

  if (!source_id || !product_id || !warehouse_id || !reservation_date) {
    throw new Error(
      'source_id, product_id, warehouse_id, and reservation_date are required'
    );
  }

  const qty = round4(reserved_quantity);

  if (qty <= 0) {
    throw new Error('reserved_quantity must be greater than zero');
  }

  const stockRow = await getOrCreateInventoryStockRowForUpdate(
    connection,
    Number(product_id),
    Number(warehouse_id)
  );

  const availableQty = round4(stockRow.available_quantity ?? stockRow.quantity);

  if (qty > availableQty) {
    throw new Error('Insufficient available stock for reservation');
  }

  const newReserved = round4(Number(stockRow.reserved_quantity || 0) + qty);

  await updateInventoryStockSnapshot(connection, stockRow.id, {
    quantity: round4(stockRow.quantity),
    reserved_quantity: newReserved,
    available_quantity: recomputeAvailable({
      quantity: stockRow.quantity,
      reservedQuantity: newReserved,
    }),
    unit_cost: round4(stockRow.unit_cost),
    total_value: round4(stockRow.total_value),
  });

  if (bin_id) {
    const binStock = await getOrCreateInventoryBinStockRowForUpdate(
      connection,
      Number(product_id),
      Number(warehouse_id),
      Number(bin_id)
    );

    const binAvailableQty = round4(binStock.available_quantity ?? binStock.quantity);

    if (qty > binAvailableQty) {
      throw new Error('Insufficient available bin stock for reservation');
    }

    const newBinReserved = round4(Number(binStock.reserved_quantity || 0) + qty);

    await updateInventoryBinStockSnapshot(connection, binStock.id, {
      quantity: round4(binStock.quantity),
      reserved_quantity: newBinReserved,
      available_quantity: recomputeAvailable({
        quantity: binStock.quantity,
        reservedQuantity: newBinReserved,
      }),
      unit_cost: round4(binStock.unit_cost),
      total_value: round4(binStock.total_value),
    });
  }

  if (lot_id) {
    const lotStock = await getOrCreateInventoryLotStockRowForUpdate(
      connection,
      Number(product_id),
      Number(warehouse_id),
      bin_id ? Number(bin_id) : null,
      Number(lot_id)
    );

    const lotAvailableQty = round4(lotStock.available_quantity ?? lotStock.quantity);

    if (qty > lotAvailableQty) {
      throw new Error('Insufficient available lot stock for reservation');
    }

    const newLotReserved = round4(Number(lotStock.reserved_quantity || 0) + qty);

    await updateInventoryLotStockSnapshot(connection, lotStock.id, {
      quantity: round4(lotStock.quantity),
      reserved_quantity: newLotReserved,
      available_quantity: recomputeAvailable({
        quantity: lotStock.quantity,
        reservedQuantity: newLotReserved,
      }),
      unit_cost: round4(lotStock.unit_cost),
      total_value: round4(lotStock.total_value),
    });
  }

  if (serial_id) {
    const [[serial]] = await connection.query(
      `
      SELECT *
      FROM inventory_serials
      WHERE id = ?
      FOR UPDATE
      `,
      [Number(serial_id)]
    );

    if (!serial) {
      throw new Error('Serial not found');
    }

    if (serial.status !== 'IN_STOCK') {
      throw new Error('Only IN_STOCK serials can be reserved');
    }

    await connection.query(
      `
      UPDATE inventory_serials
      SET status = 'RESERVED'
      WHERE id = ?
      `,
      [Number(serial_id)]
    );
  }

  const reservationNumber = await getNextReservationNumber(connection);

  const [result] = await connection.query(
    `
    INSERT INTO inventory_reservations (
      reservation_number,
      source_type,
      source_id,
      source_line_id,
      product_id,
      warehouse_id,
      bin_id,
      lot_id,
      serial_id,
      reserved_quantity,
      issued_quantity,
      released_quantity,
      status,
      reservation_date,
      expiry_date,
      remarks,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'OPEN', ?, ?, ?, ?)
    `,
    [
      reservationNumber,
      source_type,
      Number(source_id),
      source_line_id ? Number(source_line_id) : null,
      Number(product_id),
      Number(warehouse_id),
      bin_id ? Number(bin_id) : null,
      lot_id ? Number(lot_id) : null,
      serial_id ? Number(serial_id) : null,
      qty,
      reservation_date,
      expiry_date,
      remarks,
      userId ?? null,
    ]
  );

  return {
    message: 'Reservation created successfully',
    id: result.insertId,
    reservation_number: reservationNumber,
  };
};

export const releaseReservationService = async (connection, reservationId) => {
  const [[reservation]] = await connection.query(
    `
    SELECT *
    FROM inventory_reservations
    WHERE id = ?
    FOR UPDATE
    `,
    [reservationId]
  );

  if (!reservation) {
    throw new Error('Reservation not found');
  }

  if (!['OPEN', 'PARTIAL_ISSUED'].includes(reservation.status)) {
    throw new Error('Only open reservations can be released');
  }

  const remainingQty = round4(
    Number(reservation.reserved_quantity || 0) -
      Number(reservation.issued_quantity || 0) -
      Number(reservation.released_quantity || 0)
  );

  if (remainingQty <= 0) {
    throw new Error('No remaining reservation quantity to release');
  }

  const stockRow = await getOrCreateInventoryStockRowForUpdate(
    connection,
    reservation.product_id,
    reservation.warehouse_id
  );

  const newReserved = round4(Number(stockRow.reserved_quantity || 0) - remainingQty);

  await updateInventoryStockSnapshot(connection, stockRow.id, {
    quantity: round4(stockRow.quantity),
    reserved_quantity: newReserved,
    available_quantity: recomputeAvailable({
      quantity: stockRow.quantity,
      reservedQuantity: newReserved,
    }),
    unit_cost: round4(stockRow.unit_cost),
    total_value: round4(stockRow.total_value),
  });

  if (reservation.bin_id) {
    const binStock = await getOrCreateInventoryBinStockRowForUpdate(
      connection,
      reservation.product_id,
      reservation.warehouse_id,
      reservation.bin_id
    );

    const newBinReserved = round4(Number(binStock.reserved_quantity || 0) - remainingQty);

    await updateInventoryBinStockSnapshot(connection, binStock.id, {
      quantity: round4(binStock.quantity),
      reserved_quantity: newBinReserved,
      available_quantity: recomputeAvailable({
        quantity: binStock.quantity,
        reservedQuantity: newBinReserved,
      }),
      unit_cost: round4(binStock.unit_cost),
      total_value: round4(binStock.total_value),
    });
  }

  if (reservation.lot_id) {
    const lotStock = await getOrCreateInventoryLotStockRowForUpdate(
      connection,
      reservation.product_id,
      reservation.warehouse_id,
      reservation.bin_id || null,
      reservation.lot_id
    );

    const newLotReserved = round4(Number(lotStock.reserved_quantity || 0) - remainingQty);

    await updateInventoryLotStockSnapshot(connection, lotStock.id, {
      quantity: round4(lotStock.quantity),
      reserved_quantity: newLotReserved,
      available_quantity: recomputeAvailable({
        quantity: lotStock.quantity,
        reservedQuantity: newLotReserved,
      }),
      unit_cost: round4(lotStock.unit_cost),
      total_value: round4(lotStock.total_value),
    });
  }

  if (reservation.serial_id) {
    await connection.query(
      `
      UPDATE inventory_serials
      SET status = 'IN_STOCK'
      WHERE id = ?
      `,
      [reservation.serial_id]
    );
  }

  await connection.query(
    `
    UPDATE inventory_reservations
    SET released_quantity = released_quantity + ?,
        status = 'RELEASED'
    WHERE id = ?
    `,
    [remainingQty, reservationId]
  );

  return {
    message: 'Reservation released successfully',
    released_quantity: remainingQty,
  };
};

export const issueReservationService = async (
  connection,
  reservationId,
  issueQuantity,
  userId
) => {
  const [[reservation]] = await connection.query(
    `
    SELECT *
    FROM inventory_reservations
    WHERE id = ?
    FOR UPDATE
    `,
    [reservationId]
  );

  if (!reservation) {
    throw new Error('Reservation not found');
  }

  if (!['OPEN', 'PARTIAL_ISSUED'].includes(reservation.status)) {
    throw new Error('Only open reservations can be issued');
  }

  const remainingQty = round4(
    Number(reservation.reserved_quantity || 0) -
      Number(reservation.issued_quantity || 0) -
      Number(reservation.released_quantity || 0)
  );

  const qtyToIssue = round4(issueQuantity || remainingQty);

  if (qtyToIssue <= 0) {
    throw new Error('issue_quantity must be greater than zero');
  }

  if (qtyToIssue > remainingQty) {
    throw new Error('Issue quantity exceeds remaining reserved quantity');
  }

  const stockRow = await getOrCreateInventoryStockRowForUpdate(
    connection,
    reservation.product_id,
    reservation.warehouse_id
  );

  const newReserved = round4(Number(stockRow.reserved_quantity || 0) - qtyToIssue);

  await updateInventoryStockSnapshot(connection, stockRow.id, {
    quantity: round4(stockRow.quantity),
    reserved_quantity: newReserved,
    available_quantity: recomputeAvailable({
      quantity: stockRow.quantity,
      reservedQuantity: newReserved,
    }),
    unit_cost: round4(stockRow.unit_cost),
    total_value: round4(stockRow.total_value),
  });

  if (reservation.bin_id) {
    const binStock = await getOrCreateInventoryBinStockRowForUpdate(
      connection,
      reservation.product_id,
      reservation.warehouse_id,
      reservation.bin_id
    );

    const newBinReserved = round4(Number(binStock.reserved_quantity || 0) - qtyToIssue);

    await updateInventoryBinStockSnapshot(connection, binStock.id, {
      quantity: round4(binStock.quantity),
      reserved_quantity: newBinReserved,
      available_quantity: recomputeAvailable({
        quantity: binStock.quantity,
        reservedQuantity: newBinReserved,
      }),
      unit_cost: round4(binStock.unit_cost),
      total_value: round4(binStock.total_value),
    });
  }

  if (reservation.lot_id) {
    const lotStock = await getOrCreateInventoryLotStockRowForUpdate(
      connection,
      reservation.product_id,
      reservation.warehouse_id,
      reservation.bin_id || null,
      reservation.lot_id
    );

    const newLotReserved = round4(Number(lotStock.reserved_quantity || 0) - qtyToIssue);

    await updateInventoryLotStockSnapshot(connection, lotStock.id, {
      quantity: round4(lotStock.quantity),
      reserved_quantity: newLotReserved,
      available_quantity: recomputeAvailable({
        quantity: lotStock.quantity,
        reservedQuantity: newLotReserved,
      }),
      unit_cost: round4(lotStock.unit_cost),
      total_value: round4(lotStock.total_value),
    });
  }

  if (reservation.serial_id) {
    await connection.query(
      `
      UPDATE inventory_serials
      SET status = 'ISSUED',
          issued_reference_type = ?,
          issued_reference_id = ?
      WHERE id = ?
      `,
      [reservation.source_type, reservation.source_id, reservation.serial_id]
    );
  }

  const newIssuedQty = round4(Number(reservation.issued_quantity || 0) + qtyToIssue);
  const totalReserved = round4(Number(reservation.reserved_quantity || 0));

  const newStatus = newIssuedQty >= totalReserved ? 'ISSUED' : 'PARTIAL_ISSUED';

  await connection.query(
    `
    UPDATE inventory_reservations
    SET issued_quantity = ?,
        status = ?
    WHERE id = ?
    `,
    [newIssuedQty, newStatus, reservationId]
  );

  return {
    message: 'Reservation issued successfully',
    issued_quantity: qtyToIssue,
    status: newStatus,
  };
};