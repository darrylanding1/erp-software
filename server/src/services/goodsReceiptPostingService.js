import { round4 } from '../utils/number.js';
import {
  getOrCreateInventoryStockRowForUpdate,
  getOrCreateInventoryLotStockRowForUpdate,
  updateInventoryStockSnapshot,
  updateInventoryLotStockSnapshot,
  recomputeAvailable,
} from './stockDimensionService.js';
import { insertInventoryLedger } from './inventoryLedgerService.js';

const parseSerialNumbers = (value) => {
  if (!value) return [];

  let parsed = value;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value
        .split(/\r?\n|,|;/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error('serial_numbers_json must be a valid JSON array');
  }

  const unique = [];
  const seen = new Set();

  for (const entry of parsed) {
    const serial = String(entry || '').trim();
    if (!serial) continue;

    const normalized = serial.toUpperCase();
    if (seen.has(normalized)) {
      throw new Error(`Duplicate serial number provided: ${serial}`);
    }

    seen.add(normalized);
    unique.push(serial);
  }

  return unique;
};

const buildReceiptLineDescriptor = (line) =>
  line.product_name || line.sku
    ? `${line.product_name || 'Item'}${line.sku ? ` (${line.sku})` : ''}`
    : `Product ${line.product_id}`;

const validateTrackingRequirements = ({ line, serials, qty }) => {
  const itemLabel = buildReceiptLineDescriptor(line);

  if (line.is_serial_tracked || line.inventory_tracking_type === 'SERIAL') {
    if (!serials.length) {
      throw new Error(`${itemLabel} requires serial numbers before posting receipt`);
    }

    if (round4(serials.length) !== round4(qty)) {
      throw new Error(`${itemLabel} serial count must exactly match received quantity`);
    }
  } else if (serials.length) {
    throw new Error(`${itemLabel} is not serial-tracked, but serial numbers were provided`);
  }

  if (line.is_lot_tracked || line.inventory_tracking_type === 'LOT') {
    if (!String(line.lot_number || '').trim()) {
      throw new Error(`${itemLabel} requires a lot number before posting receipt`);
    }
  }

  if (line.is_expiry_tracked && !line.expiry_date) {
    throw new Error(`${itemLabel} requires an expiry date before posting receipt`);
  }
};

const findExistingLot = async ({ connection, productId, warehouseId, lotNumber }) => {
  const [[lot]] = await connection.query(
    `
    SELECT *
    FROM inventory_lots
    WHERE product_id = ?
      AND warehouse_id = ?
      AND lot_number = ?
    FOR UPDATE
    `,
    [productId, warehouseId, lotNumber]
  );

  return lot || null;
};

const upsertInventoryLot = async ({ connection, line, warehouseId, unitCost }) => {
  const shouldUseLotRecord =
    Boolean(line.is_lot_tracked) ||
    Boolean(line.is_expiry_tracked) ||
    String(line.lot_number || '').trim().length > 0;

  if (!shouldUseLotRecord) {
    return null;
  }

  const lotNumber = String(line.lot_number || '').trim();
  if (!lotNumber) {
    throw new Error(`${buildReceiptLineDescriptor(line)} is missing a lot number`);
  }

  const existingLot = await findExistingLot({
    connection,
    productId: Number(line.product_id),
    warehouseId,
    lotNumber,
  });

  if (existingLot) {
    if (
      existingLot.expiry_date &&
      line.expiry_date &&
      String(existingLot.expiry_date).slice(0, 10) !== String(line.expiry_date).slice(0, 10)
    ) {
      throw new Error(
        `${buildReceiptLineDescriptor(line)} lot ${lotNumber} already exists with a different expiry date`
      );
    }

    await connection.query(
      `
      UPDATE inventory_lots
      SET expiry_date = COALESCE(?, expiry_date),
          unit_cost = ?,
          status = CASE
            WHEN expiry_date IS NOT NULL AND expiry_date < CURDATE() THEN 'EXPIRED'
            ELSE status
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [line.expiry_date || null, round4(unitCost), existingLot.id]
    );

    return {
      ...existingLot,
      expiry_date: line.expiry_date || existingLot.expiry_date,
    };
  }

  const lotStatus =
    line.expiry_date && String(line.expiry_date).slice(0, 10) < new Date().toISOString().slice(0, 10)
      ? 'EXPIRED'
      : 'ACTIVE';

  const [result] = await connection.query(
    `
    INSERT INTO inventory_lots (
      product_id,
      warehouse_id,
      bin_id,
      lot_number,
      expiry_date,
      status,
      unit_cost,
      received_reference_type,
      received_reference_id,
      received_reference_line_id
    )
    VALUES (?, ?, NULL, ?, ?, ?, ?, 'GOODS_RECEIPT', ?, ?)
    `,
    [
      Number(line.product_id),
      warehouseId,
      lotNumber,
      line.expiry_date || null,
      lotStatus,
      round4(unitCost),
      Number(line.goods_receipt_id),
      Number(line.id),
    ]
  );

  return {
    id: result.insertId,
    product_id: Number(line.product_id),
    warehouse_id: warehouseId,
    lot_number: lotNumber,
    expiry_date: line.expiry_date || null,
  };
};

const applyLotStockReceipt = async ({
  connection,
  productId,
  warehouseId,
  lotId,
  quantity,
  unitCost,
}) => {
  const lotStock = await getOrCreateInventoryLotStockRowForUpdate(
    connection,
    productId,
    warehouseId,
    null,
    lotId
  );

  const qtyBefore = round4(lotStock.quantity);
  const valueBefore = round4(lotStock.total_value);
  const reservedBefore = round4(lotStock.reserved_quantity);
  const qtyDelta = round4(quantity);
  const receiptValue = round4(qtyDelta * unitCost);
  const qtyAfter = round4(qtyBefore + qtyDelta);
  const valueAfter = round4(valueBefore + receiptValue);
  const avgAfter = qtyAfter > 0 ? round4(valueAfter / qtyAfter) : round4(unitCost);

  await updateInventoryLotStockSnapshot(connection, lotStock.id, {
    quantity: qtyAfter,
    reserved_quantity: reservedBefore,
    available_quantity: recomputeAvailable({
      quantity: qtyAfter,
      reservedQuantity: reservedBefore,
    }),
    unit_cost: avgAfter,
    total_value: valueAfter,
  });
};

const createInventorySerials = async ({
  connection,
  line,
  warehouseId,
  lotId,
  serials,
  unitCost,
}) => {
  for (const serialNumber of serials) {
    const [[existing]] = await connection.query(
      `
      SELECT id, product_id, status
      FROM inventory_serials
      WHERE serial_number = ?
      FOR UPDATE
      `,
      [serialNumber]
    );

    if (existing) {
      throw new Error(
        `Serial number ${serialNumber} already exists for product ${existing.product_id}`
      );
    }

    await connection.query(
      `
      INSERT INTO inventory_serials (
        product_id,
        warehouse_id,
        bin_id,
        lot_id,
        serial_number,
        status,
        unit_cost,
        received_reference_type,
        received_reference_id
      )
      VALUES (?, ?, NULL, ?, ?, 'IN_STOCK', ?, 'GOODS_RECEIPT', ?)
      `,
      [
        Number(line.product_id),
        warehouseId,
        lotId ?? null,
        serialNumber,
        round4(unitCost),
        Number(line.goods_receipt_id),
      ]
    );
  }
};

export const applyGoodsReceiptInventoryImpact = async ({
  connection,
  receipt,
  line,
  userId,
}) => {
  const qty = round4(line.received_quantity);
  const unitCost = round4(line.unit_cost);

  if (qty <= 0) {
    throw new Error(`${buildReceiptLineDescriptor(line)} has invalid received quantity`);
  }

  const serials = parseSerialNumbers(line.serial_numbers_json);
  validateTrackingRequirements({ line, serials, qty });

  const stockRow = await getOrCreateInventoryStockRowForUpdate(
    connection,
    Number(line.product_id),
    Number(receipt.warehouse_id)
  );

  const qtyBefore = round4(stockRow.quantity);
  const valueBefore = round4(stockRow.total_value);
  const reservedBefore = round4(stockRow.reserved_quantity);
  const avgBefore = round4(stockRow.unit_cost);
  const receiptValue = round4(qty * unitCost);
  const qtyAfter = round4(qtyBefore + qty);
  const valueAfter = round4(valueBefore + receiptValue);
  const avgAfter = qtyAfter > 0 ? round4(valueAfter / qtyAfter) : unitCost;

  await updateInventoryStockSnapshot(connection, stockRow.id, {
    quantity: qtyAfter,
    reserved_quantity: reservedBefore,
    available_quantity: recomputeAvailable({
      quantity: qtyAfter,
      reservedQuantity: reservedBefore,
    }),
    unit_cost: avgAfter,
    total_value: valueAfter,
  });

  const lot = await upsertInventoryLot({
    connection,
    line,
    warehouseId: Number(receipt.warehouse_id),
    unitCost,
  });

  if (lot) {
    await applyLotStockReceipt({
      connection,
      productId: Number(line.product_id),
      warehouseId: Number(receipt.warehouse_id),
      lotId: Number(lot.id),
      quantity: qty,
      unitCost,
    });
  }

  if (serials.length) {
    await createInventorySerials({
      connection,
      line,
      warehouseId: Number(receipt.warehouse_id),
      lotId: lot ? Number(lot.id) : null,
      serials,
      unitCost,
    });
  }

  await insertInventoryLedger(connection, {
    posting_date: receipt.receipt_date,
    reference_type: 'GOODS_RECEIPT',
    reference_id: Number(receipt.id),
    reference_line_id: Number(line.id),
    product_id: Number(line.product_id),
    warehouse_id: Number(receipt.warehouse_id),
    movement_type: 'RECEIPT',
    quantity_in: qty,
    quantity_out: 0,
    unit_cost: unitCost,
    line_total: receiptValue,
    qty_before: qtyBefore,
    qty_after: qtyAfter,
    value_before: valueBefore,
    value_after: valueAfter,
    avg_cost_before: avgBefore,
    avg_cost_after: avgAfter,
    remarks: `Goods receipt ${receipt.gr_number}`,
    created_by: userId ?? null,
  });

  await connection.query(
    `
    UPDATE products
    SET quantity = quantity + ?
    WHERE id = ?
    `,
    [qty, Number(line.product_id)]
  );

  return {
    qtyBefore,
    qtyAfter,
    valueBefore,
    valueAfter,
    avgBefore,
    avgAfter,
    lot_id: lot ? Number(lot.id) : null,
    serial_count: serials.length,
  };
};