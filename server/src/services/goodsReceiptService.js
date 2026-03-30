import db from '../config/db.js';
import { createAuditLog } from '../utils/auditTrail.js';

const round4 = (value) => Number(Number(value || 0).toFixed(4));
const round2 = (value) => Number(Number(value || 0).toFixed(2));

const getNextGrNumber = () => `GR-${Date.now()}`;

const getGoodsReceiptHeader = async (connection, goodsReceiptId) => {
  const [[header]] = await connection.query(
    `
    SELECT
      gr.*,
      po.po_number,
      po.source_type,
      po.source_reference_id,
      s.name AS supplier_name,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      u.full_name AS posted_by_name
    FROM goods_receipts gr
    INNER JOIN purchase_orders po
      ON po.id = gr.purchase_order_id
    INNER JOIN suppliers s
      ON s.id = po.supplier_id
    INNER JOIN warehouses w
      ON w.id = gr.warehouse_id
    LEFT JOIN users u
      ON u.id = gr.posted_by
    WHERE gr.id = ?
    LIMIT 1
    `,
    [Number(goodsReceiptId)]
  );

  return header || null;
};

const getGoodsReceiptItems = async (connection, goodsReceiptId) => {
  const [items] = await connection.query(
    `
    SELECT
      gri.*,
      p.name AS product_name,
      p.sku,
      wh.name AS requested_warehouse_name,
      wh.code AS requested_warehouse_code
    FROM goods_receipt_items gri
    INNER JOIN products p
      ON p.id = gri.product_id
    LEFT JOIN warehouses wh
      ON wh.id = gri.requested_warehouse_id
    WHERE gri.goods_receipt_id = ?
    ORDER BY gri.id ASC
    `,
    [Number(goodsReceiptId)]
  );

  return items;
};

const ensureInventoryStockRow = async (connection, productId, warehouseId) => {
  const [[row]] = await connection.query(
    `
    SELECT *
    FROM inventory_stocks
    WHERE product_id = ?
      AND warehouse_id = ?
    LIMIT 1
    `,
    [Number(productId), Number(warehouseId)]
  );

  if (row) return row;

  await connection.query(
    `
    INSERT INTO inventory_stocks (
      product_id,
      warehouse_id,
      quantity,
      unit_cost,
      total_value,
      reserved_quantity,
      available_quantity
    )
    VALUES (?, ?, 0, 0, 0, 0, 0)
    `,
    [Number(productId), Number(warehouseId)]
  );

  const [[created]] = await connection.query(
    `
    SELECT *
    FROM inventory_stocks
    WHERE product_id = ?
      AND warehouse_id = ?
    LIMIT 1
    `,
    [Number(productId), Number(warehouseId)]
  );

  return created;
};

const recalcPurchaseOrderStatus = async (connection, purchaseOrderId) => {
  const [[totals]] = await connection.query(
    `
    SELECT
      COUNT(*) AS total_lines,
      COALESCE(SUM(quantity), 0) AS total_qty,
      COALESCE(SUM(received_quantity), 0) AS received_qty
    FROM purchase_order_items
    WHERE purchase_order_id = ?
    `,
    [Number(purchaseOrderId)]
  );

  const totalQty = round4(totals.total_qty);
  const receivedQty = round4(totals.received_qty);

  let newStatus = 'Pending';

  if (receivedQty <= 0) {
    newStatus = 'Pending';
  } else if (receivedQty < totalQty) {
    newStatus = 'Partial';
  } else {
    newStatus = 'Received';
  }

  await connection.query(
    `
    UPDATE purchase_orders
    SET status = ?,
        received_at = CASE WHEN ? = 'Received' THEN NOW() ELSE received_at END
    WHERE id = ?
    `,
    [newStatus, newStatus, Number(purchaseOrderId)]
  );
};

const createInventoryLedgerReceipt = async ({
  connection,
  postingDate,
  referenceId,
  referenceLineId,
  productId,
  warehouseId,
  quantityIn,
  unitCost,
  createdBy,
  remarks,
}) => {
  const stockBefore = await ensureInventoryStockRow(connection, productId, warehouseId);

  const qtyBefore = round4(stockBefore.quantity);
  const valueBefore = round4(stockBefore.total_value);
  const avgCostBefore = round4(stockBefore.unit_cost);

  const lineTotal = round4(quantityIn * unitCost);
  const qtyAfter = round4(qtyBefore + quantityIn);
  const valueAfter = round4(valueBefore + lineTotal);
  const avgCostAfter = qtyAfter > 0 ? round4(valueAfter / qtyAfter) : 0;

  await connection.query(
    `
    INSERT INTO inventory_ledger (
      posting_date,
      reference_type,
      reference_id,
      reference_line_id,
      product_id,
      warehouse_id,
      movement_type,
      quantity_in,
      quantity_out,
      unit_cost,
      line_total,
      qty_before,
      qty_after,
      value_before,
      value_after,
      avg_cost_before,
      avg_cost_after,
      remarks,
      created_by
    )
    VALUES (?, 'GOODS_RECEIPT', ?, ?, ?, ?, 'RECEIPT', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      postingDate,
      Number(referenceId),
      Number(referenceLineId),
      Number(productId),
      Number(warehouseId),
      round4(quantityIn),
      round4(unitCost),
      round4(lineTotal),
      qtyBefore,
      qtyAfter,
      valueBefore,
      valueAfter,
      avgCostBefore,
      avgCostAfter,
      remarks || null,
      createdBy || null,
    ]
  );

  await connection.query(
    `
    UPDATE inventory_stocks
    SET quantity = ?,
        unit_cost = ?,
        total_value = ?,
        available_quantity = ?,
        updated_at = CURRENT_TIMESTAMP()
    WHERE product_id = ?
      AND warehouse_id = ?
    `,
    [
      qtyAfter,
      avgCostAfter,
      valueAfter,
      round4(qtyAfter - Number(stockBefore.reserved_quantity || 0)),
      Number(productId),
      Number(warehouseId),
    ]
  );
};

export const getGoodsReceiptMetaService = async () => {
  const [purchaseOrders] = await db.query(
    `
    SELECT
      po.id,
      po.po_number,
      po.status,
      po.order_date,
      po.source_type,
      po.source_reference_id,
      s.name AS supplier_name,
      COALESCE(SUM(GREATEST(poi.quantity - COALESCE(poi.received_quantity, 0), 0)), 0) AS open_quantity
    FROM purchase_orders po
    INNER JOIN suppliers s
      ON s.id = po.supplier_id
    INNER JOIN purchase_order_items poi
      ON poi.purchase_order_id = po.id
    WHERE po.status IN ('Pending', 'Partial')
    GROUP BY po.id, po.po_number, po.status, po.order_date, po.source_type, po.source_reference_id, s.name
    HAVING open_quantity > 0
    ORDER BY po.id DESC
    `
  );

  const [warehouses] = await db.query(
    `
    SELECT id, code, name
    FROM warehouses
    WHERE status = 'Active'
    ORDER BY name ASC
    `
  );

  return {
    purchaseOrders,
    warehouses,
  };
};

export const getGoodsReceiptSuggestionsService = async (filters = {}) => {
  const { purchase_order_id = '', warehouse_id = '' } = filters;

  if (!purchase_order_id) {
    return {
      purchase_order: null,
      suggested_warehouse_id: null,
      suggested_lines: [],
    };
  }

  const [[header]] = await db.query(
    `
    SELECT
      po.id,
      po.po_number,
      po.status,
      po.order_date,
      po.source_type,
      po.source_reference_id,
      s.id AS supplier_id,
      s.name AS supplier_name
    FROM purchase_orders po
    INNER JOIN suppliers s
      ON s.id = po.supplier_id
    WHERE po.id = ?
    LIMIT 1
    `,
    [Number(purchase_order_id)]
  );

  if (!header) {
    throw new Error('Purchase order not found');
  }

  const [lines] = await db.query(
    `
    SELECT
      poi.id,
      poi.purchase_order_id,
      poi.purchase_requisition_item_id,
      poi.product_id,
      poi.requested_warehouse_id,
      poi.quantity,
      poi.received_quantity,
      poi.unit_cost,
      poi.line_total,
      p.name AS product_name,
      p.sku,
      wh.name AS requested_warehouse_name,
      wh.code AS requested_warehouse_code,
      pri.requested_quantity AS pr_requested_quantity,
      pri.ordered_quantity AS pr_ordered_quantity
    FROM purchase_order_items poi
    INNER JOIN products p
      ON p.id = poi.product_id
    LEFT JOIN warehouses wh
      ON wh.id = poi.requested_warehouse_id
    LEFT JOIN purchase_requisition_items pri
      ON pri.id = poi.purchase_requisition_item_id
    WHERE poi.purchase_order_id = ?
    ORDER BY poi.id ASC
    `,
    [Number(purchase_order_id)]
  );

  const suggestedWarehouseId =
    warehouse_id
      ? Number(warehouse_id)
      : (() => {
          const warehouseCountMap = new Map();

          for (const line of lines) {
            const key = line.requested_warehouse_id
              ? String(line.requested_warehouse_id)
              : '';
            if (!key) continue;
            warehouseCountMap.set(
              key,
              (warehouseCountMap.get(key) || 0) + Number(line.quantity || 0)
            );
          }

          if (!warehouseCountMap.size) return null;

          return Number(
            [...warehouseCountMap.entries()].sort((a, b) => b[1] - a[1])[0][0]
          );
        })();

  const suggestedLines = lines
    .map((line) => {
      const remainingPoQty = round4(
        Number(line.quantity || 0) - Number(line.received_quantity || 0)
      );

      const lineSuggestedWarehouseId =
        Number(line.requested_warehouse_id || 0) || suggestedWarehouseId || null;

      const isWarehouseMatch =
        !warehouse_id || Number(lineSuggestedWarehouseId || 0) === Number(warehouse_id);

      return {
        id: line.id,
        purchase_order_item_id: line.id,
        purchase_requisition_item_id: line.purchase_requisition_item_id,
        product_id: line.product_id,
        product_name: line.product_name,
        sku: line.sku,
        requested_warehouse_id: line.requested_warehouse_id,
        requested_warehouse_name: line.requested_warehouse_name,
        requested_warehouse_code: line.requested_warehouse_code,
        suggested_warehouse_id: lineSuggestedWarehouseId,
        quantity: round4(line.quantity),
        received_quantity: round4(line.received_quantity),
        remaining_po_quantity: remainingPoQty,
        suggested_receipt_quantity: remainingPoQty,
        unit_cost: round4(line.unit_cost),
        is_warehouse_match: isWarehouseMatch,
      };
    })
    .filter((line) => line.remaining_po_quantity > 0)
    .filter((line) => {
      if (!warehouse_id) return true;
      return Number(line.suggested_warehouse_id || 0) === Number(warehouse_id);
    });

  return {
    purchase_order: header,
    suggested_warehouse_id: suggestedWarehouseId,
    suggested_lines: suggestedLines,
  };
};

export const getGoodsReceiptsService = async (filters = {}) => {
  const { purchase_order_id = '', status = '' } = filters;

  let sql = `
    SELECT
      gr.*,
      po.po_number,
      po.source_type,
      s.name AS supplier_name,
      w.name AS warehouse_name,
      w.code AS warehouse_code
    FROM goods_receipts gr
    INNER JOIN purchase_orders po
      ON po.id = gr.purchase_order_id
    INNER JOIN suppliers s
      ON s.id = po.supplier_id
    INNER JOIN warehouses w
      ON w.id = gr.warehouse_id
    WHERE 1 = 1
  `;
  const values = [];

  if (purchase_order_id) {
    sql += ` AND gr.purchase_order_id = ?`;
    values.push(Number(purchase_order_id));
  }

  if (status) {
    sql += ` AND gr.status = ?`;
    values.push(status);
  }

  sql += ` ORDER BY gr.id DESC`;

  const [headers] = await db.query(sql, values);

  if (!headers.length) return [];

  const ids = headers.map((row) => row.id);

  const [items] = await db.query(
    `
    SELECT
      gri.*,
      p.name AS product_name,
      p.sku
    FROM goods_receipt_items gri
    INNER JOIN products p
      ON p.id = gri.product_id
    WHERE gri.goods_receipt_id IN (?)
    ORDER BY gri.goods_receipt_id DESC, gri.id ASC
    `,
    [ids]
  );

  const itemMap = new Map();

  for (const item of items) {
    if (!itemMap.has(item.goods_receipt_id)) {
      itemMap.set(item.goods_receipt_id, []);
    }
    itemMap.get(item.goods_receipt_id).push(item);
  }

  return headers.map((header) => ({
    ...header,
    items: itemMap.get(header.id) || [],
  }));
};

export const getGoodsReceiptByIdService = async (goodsReceiptId) => {
  const connection = await db.getConnection();

  try {
    const header = await getGoodsReceiptHeader(connection, goodsReceiptId);
    if (!header) return null;

    const items = await getGoodsReceiptItems(connection, goodsReceiptId);

    return {
      ...header,
      items,
    };
  } finally {
    connection.release();
  }
};

export const createGoodsReceiptFromPurchaseOrderService = async (
  connection,
  purchaseOrderId,
  payload,
  user,
  ipAddress
) => {
  const {
    warehouse_id,
    receipt_date,
    remarks = null,
    item_ids = [],
  } = payload || {};

  if (!warehouse_id || !receipt_date) {
    throw new Error('warehouse_id and receipt_date are required');
  }

  const suggestionData = await getGoodsReceiptSuggestionsService({
    purchase_order_id: purchaseOrderId,
    warehouse_id,
  });

  if (!suggestionData.purchase_order) {
    throw new Error('Purchase order not found');
  }

  let lines = suggestionData.suggested_lines;

  if (Array.isArray(item_ids) && item_ids.length > 0) {
    lines = lines.filter((line) => item_ids.map(Number).includes(Number(line.id)));
  }

  if (!lines.length) {
    throw new Error('No open PO lines available for the selected warehouse');
  }

  const grNumber = getNextGrNumber();

  const [headerResult] = await connection.query(
    `
    INSERT INTO goods_receipts (
      gr_number,
      purchase_order_id,
      warehouse_id,
      receipt_date,
      remarks,
      status
    )
    VALUES (?, ?, ?, ?, ?, 'Draft')
    `,
    [
      grNumber,
      Number(purchaseOrderId),
      Number(warehouse_id),
      receipt_date,
      remarks,
    ]
  );

  const goodsReceiptId = headerResult.insertId;

  for (const line of lines) {
    const receiptQty = round4(line.suggested_receipt_quantity);

    await connection.query(
      `
      INSERT INTO goods_receipt_items (
        goods_receipt_id,
        purchase_order_item_id,
        purchase_requisition_item_id,
        product_id,
        requested_warehouse_id,
        received_quantity,
        remaining_po_quantity,
        suggested_receipt_quantity,
        unit_cost,
        line_total
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        goodsReceiptId,
        Number(line.purchase_order_item_id),
        line.purchase_requisition_item_id
          ? Number(line.purchase_requisition_item_id)
          : null,
        Number(line.product_id),
        line.requested_warehouse_id ? Number(line.requested_warehouse_id) : null,
        receiptQty,
        round4(line.remaining_po_quantity),
        round4(line.suggested_receipt_quantity),
        round4(line.unit_cost),
        round2(receiptQty * Number(line.unit_cost || 0)),
      ]
    );
  }

  const created = await getGoodsReceiptHeader(connection, goodsReceiptId);
  const createdItems = await getGoodsReceiptItems(connection, goodsReceiptId);

  await createAuditLog({
    userId: user?.id || null,
    action: 'CREATE',
    moduleName: 'Goods Receipts',
    recordId: goodsReceiptId,
    description: `Created goods receipt ${grNumber} from purchase order ${suggestionData.purchase_order.po_number}`,
    newValues: {
      header: created,
      items: createdItems,
    },
    ipAddress,
  });

  return {
    message: 'Goods receipt draft created successfully',
    item: {
      ...created,
      items: createdItems,
    },
  };
};

export const postGoodsReceiptService = async (
  connection,
  goodsReceiptId,
  user,
  ipAddress
) => {
  const header = await getGoodsReceiptHeader(connection, goodsReceiptId);

  if (!header) {
    throw new Error('Goods receipt not found');
  }

  if (header.status !== 'Draft') {
    throw new Error('Only draft goods receipts can be posted');
  }

  const items = await getGoodsReceiptItems(connection, goodsReceiptId);

  if (!items.length) {
    throw new Error('Cannot post a goods receipt without items');
  }

  for (const item of items) {
    const [[poItem]] = await connection.query(
      `
      SELECT *
      FROM purchase_order_items
      WHERE id = ?
      LIMIT 1
      `,
      [Number(item.purchase_order_item_id)]
    );

    if (!poItem) {
      throw new Error(`Purchase order item ${item.purchase_order_item_id} not found`);
    }

    const remainingPoQty = round4(
      Number(poItem.quantity || 0) - Number(poItem.received_quantity || 0)
    );

    if (Number(item.received_quantity || 0) <= 0) {
      throw new Error(`Receipt quantity must be greater than zero for item ${item.id}`);
    }

    if (Number(item.received_quantity || 0) > remainingPoQty) {
      throw new Error(
        `Receipt quantity exceeds open PO quantity for PO item ${poItem.id}`
      );
    }
  }

  const oldValues = {
    header,
    items,
  };

  for (const item of items) {
    const receiptQty = round4(item.received_quantity);
    const lineTotal = round4(receiptQty * Number(item.unit_cost || 0));

    await connection.query(
      `
      UPDATE purchase_order_items
      SET received_quantity = COALESCE(received_quantity, 0) + ?
      WHERE id = ?
      `,
      [receiptQty, Number(item.purchase_order_item_id)]
    );

    await createInventoryLedgerReceipt({
      connection,
      postingDate: header.receipt_date,
      referenceId: goodsReceiptId,
      referenceLineId: item.id,
      productId: item.product_id,
      warehouseId: header.warehouse_id,
      quantityIn: receiptQty,
      unitCost: round4(item.unit_cost),
      createdBy: user?.id || null,
      remarks: `PO ${header.po_number} receipt`,
    });

    void lineTotal;
  }

  await recalcPurchaseOrderStatus(connection, header.purchase_order_id);

  await connection.query(
    `
    UPDATE goods_receipts
    SET status = 'Posted',
        posted_at = NOW(),
        posted_by = ?
    WHERE id = ?
    `,
    [user?.id || null, Number(goodsReceiptId)]
  );

  const updated = await getGoodsReceiptHeader(connection, goodsReceiptId);
  const updatedItems = await getGoodsReceiptItems(connection, goodsReceiptId);

  await createAuditLog({
    userId: user?.id || null,
    action: 'POST',
    moduleName: 'Goods Receipts',
    recordId: goodsReceiptId,
    description: `Posted goods receipt ${header.gr_number}`,
    oldValues,
    newValues: {
      header: updated,
      items: updatedItems,
    },
    ipAddress,
  });

  return {
    message: 'Goods receipt posted successfully',
    item: {
      ...updated,
      items: updatedItems,
    },
  };
};