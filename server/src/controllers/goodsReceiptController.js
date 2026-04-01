import db from '../config/db.js';
import { buildScopeWhereClause, requireDataScope } from '../middleware/dataScopeMiddleware.js';


const buildWarehouseScope = (scope, alias = 'w') =>
  buildScopeWhereClause(scope, {
    company: `${alias}.company_id`,
    branch: `${alias}.branch_id`,
    businessUnit: `${alias}.business_unit_id`,
  });

const buildPurchaseOrderScope = (scope, alias = 'po') =>
  buildScopeWhereClause(scope, {
    company: `${alias}.company_id`,
    branch: `${alias}.branch_id`,
    businessUnit: `${alias}.business_unit_id`,
  });

const buildGoodsReceiptScope = (scope, alias = 'gr') =>
  buildScopeWhereClause(scope, {
    company: `${alias}.company_id`,
    branch: `${alias}.branch_id`,
    businessUnit: `${alias}.business_unit_id`,
  });

const assertWarehouseInScope = async (connection, warehouseId, scope) => {
  const warehouseScope = buildWarehouseScope(scope, 'w');
  const [warehouseRows] = await connection.query(
    `
    SELECT id, name, code, status
    FROM warehouses w
    WHERE w.id = ? ${warehouseScope.sql}
    LIMIT 1
    `,
    [Number(warehouseId), ...warehouseScope.values]
  );

  if (!warehouseRows.length) {
    throw new Error('Warehouse not found in the active scope');
  }

  if (warehouseRows[0].status !== 'Active') {
    throw new Error('Inactive warehouse cannot receive stock');
  }

  return warehouseRows[0];
};

const getStockStatus = (quantity) => {
  const qty = Number(quantity) || 0;

  if (qty <= 0) return 'Out of Stock';
  if (qty <= 10) return 'Low Stock';
  return 'In Stock';
};

const ensureInventoryRow = async (connection, productId, warehouseId) => {
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
    ON DUPLICATE KEY UPDATE updated_at = updated_at
    `,
    [productId, warehouseId]
  );
};

const syncProductTotalFromWarehouses = async (connection, productId) => {
  const [[sumRow]] = await connection.query(
    `
    SELECT COALESCE(SUM(quantity), 0) AS total_quantity
    FROM inventory_stocks
    WHERE product_id = ?
    `,
    [productId]
  );

  const totalQuantity = Number(sumRow.total_quantity) || 0;
  const status = getStockStatus(totalQuantity);

  await connection.query(
    `
    UPDATE products
    SET quantity = ?, status = ?
    WHERE id = ?
    `,
    [totalQuantity, status, productId]
  );
};

const syncInventoryValuation = async (
  connection,
  productId,
  warehouseId,
  receivedQty,
  unitCost
) => {
  await ensureInventoryRow(connection, productId, warehouseId);

  const [[inventoryRow]] = await connection.query(
    `
    SELECT *
    FROM inventory_stocks
    WHERE product_id = ? AND warehouse_id = ?
    FOR UPDATE
    `,
    [productId, warehouseId]
  );

  const previousQty = Number(inventoryRow.quantity) || 0;
  const previousReserved = Number(inventoryRow.reserved_quantity) || 0;
  const previousAvailable = Number(inventoryRow.available_quantity) || 0;
  const previousUnitCost = Number(inventoryRow.unit_cost) || 0;
  const previousTotalValue = Number(inventoryRow.total_value) || 0;

  const qty = Number(receivedQty) || 0;
  const cost = Number(unitCost) || 0;

  const newQty = previousQty + qty;
  const addedValue = qty * cost;
  const newTotalValue = previousTotalValue + addedValue;
  const newUnitCost = newQty > 0 ? newTotalValue / newQty : previousUnitCost;
  const newAvailableQty = Math.max(0, newQty - previousReserved);

  await connection.query(
    `
    UPDATE inventory_stocks
    SET quantity = ?,
        reserved_quantity = ?,
        available_quantity = ?,
        unit_cost = ?,
        total_value = ?
    WHERE product_id = ? AND warehouse_id = ?
    `,
    [
      newQty,
      previousReserved,
      newAvailableQty,
      newUnitCost,
      newTotalValue,
      productId,
      warehouseId,
    ]
  );

  return {
    previousQty,
    newQty,
    previousAvailable,
    newAvailableQty,
    previousUnitCost,
    newUnitCost,
    previousTotalValue,
    newTotalValue,
  };
};

const insertInventoryLedgerEntry = async ({
  connection,
  receiptDate,
  goodsReceiptId,
  goodsReceiptItemId,
  productId,
  warehouseId,
  quantity,
  unitCost,
  stockState,
  remarks,
  userId,
}) => {
  const qtyIn = Number(quantity) || 0;
  const cost = Number(unitCost) || 0;
  const lineTotal = qtyIn * cost;

  await connection.query(
    `
    INSERT INTO inventory_ledger
    (
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
      receiptDate,
      goodsReceiptId,
      goodsReceiptItemId,
      productId,
      warehouseId,
      qtyIn,
      cost,
      lineTotal,
      stockState.previousQty,
      stockState.newQty,
      stockState.previousTotalValue,
      stockState.newTotalValue,
      stockState.previousUnitCost,
      stockState.newUnitCost,
      remarks || null,
      userId || null,
    ]
  );
};

export const getGoodsReceiptMeta = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const warehouseScope = buildWarehouseScope(scope, 'w');
    const purchaseOrderScope = buildPurchaseOrderScope(scope, 'po');

    const [warehouses] = await db.query(
      `
      SELECT id, name, code, address, status
      FROM warehouses w
      WHERE w.status = 'Active' ${warehouseScope.sql}
      ORDER BY w.name ASC
      `,
      warehouseScope.values
    );

    const [purchaseOrders] = await db.query(
      `
      SELECT
        po.id,
        po.po_number,
        po.order_date,
        po.status,
        po.total_amount,
        po.received_at,
        po.source_type,
        po.source_reference_id,
        s.name AS supplier_name,
        COALESCE(SUM(GREATEST(poi.quantity - COALESCE(poi.received_quantity, 0), 0)), 0) AS open_quantity
      FROM purchase_orders po
      INNER JOIN suppliers s ON po.supplier_id = s.id
      INNER JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      WHERE po.status IN ('Pending', 'Partial')
        ${purchaseOrderScope.sql}
      GROUP BY
        po.id,
        po.po_number,
        po.order_date,
        po.status,
        po.total_amount,
        po.received_at,
        po.source_type,
        po.source_reference_id,
        s.name
      HAVING open_quantity > 0
      ORDER BY po.order_date DESC, po.id DESC
      `,
      purchaseOrderScope.values
    );

    res.json({
      warehouses,
      purchaseOrders,
    });
  } catch (error) {
    console.error('Get goods receipt meta error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch goods receipt metadata' });
  }
};

export const getGoodsReceiptSuggestions = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { purchase_order_id, warehouse_id = '' } = req.query;

    if (!purchase_order_id) {
      return res.status(400).json({ message: 'purchase_order_id is required' });
    }

    const [poRows] = await db.query(
      `
      SELECT
        po.id,
        po.po_number,
        po.order_date,
        po.status,
        po.source_type,
        po.source_reference_id,
        s.id AS supplier_id,
        s.name AS supplier_name
      FROM purchase_orders po
      INNER JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.id = ? ${buildPurchaseOrderScope(scope, 'po').sql}
      LIMIT 1
      `,
      [purchase_order_id, ...buildPurchaseOrderScope(scope, 'po').values]
    );

    if (poRows.length === 0) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    const [rows] = await db.query(
      `
      SELECT
        poi.id,
        poi.purchase_order_id,
        poi.purchase_requisition_item_id,
        poi.product_id,
        poi.quantity,
        poi.received_quantity,
        poi.unit_cost,
        poi.line_total,
        poi.requested_warehouse_id,
        p.name AS product_name,
        p.sku,
        w.name AS warehouse_name,
        w.code AS warehouse_code
      FROM purchase_order_items poi
      INNER JOIN products p ON p.id = poi.product_id
      LEFT JOIN warehouses w ON w.id = poi.requested_warehouse_id
      WHERE poi.purchase_order_id = ?
      ORDER BY poi.id ASC
      `,
      [purchase_order_id]
    );

    const suggestions = rows
      .map((item) => {
        const orderedQty = Number(item.quantity) || 0;
        const receivedQty = Number(item.received_quantity) || 0;
        const remainingQuantity = Math.max(0, orderedQty - receivedQty);

        return {
          ...item,
          remaining_quantity: remainingQuantity,
          suggested_quantity: remainingQuantity,
          warehouse_match:
            !warehouse_id ||
            !item.requested_warehouse_id ||
            Number(item.requested_warehouse_id) === Number(warehouse_id),
        };
      })
      .filter((item) => item.remaining_quantity > 0)
      .filter((item) => {
        if (!warehouse_id) return true;
        if (!item.requested_warehouse_id) return true;
        return Number(item.requested_warehouse_id) === Number(warehouse_id);
      });

    let suggestedWarehouseId = null;

    if (warehouse_id) {
      suggestedWarehouseId = Number(warehouse_id);
    } else {
      const grouped = new Map();

      for (const row of suggestions) {
        if (!row.requested_warehouse_id) continue;
        const key = Number(row.requested_warehouse_id);
        grouped.set(key, (grouped.get(key) || 0) + (Number(row.remaining_quantity) || 0));
      }

      if (grouped.size > 0) {
        suggestedWarehouseId = [...grouped.entries()].sort((a, b) => b[1] - a[1])[0][0];
      }
    }

    res.json({
      purchase_order: poRows[0],
      suggested_warehouse_id: suggestedWarehouseId,
      items: suggestions,
    });
  } catch (error) {
    console.error('Get goods receipt suggestions error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to load receiving suggestions' });
  }
};

export const getPurchaseOrderForReceipt = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { id } = req.params;

    const [poRows] = await db.query(
      `
      SELECT
        po.id,
        po.po_number,
        po.order_date,
        po.status,
        po.total_amount,
        po.notes,
        po.source_type,
        po.source_reference_id,
        s.id AS supplier_id,
        s.name AS supplier_name,
        s.contact_person,
        s.email,
        s.phone
      FROM purchase_orders po
      INNER JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.id = ? ${buildPurchaseOrderScope(scope, 'po').sql}
      `,
      [id, ...buildPurchaseOrderScope(scope, 'po').values]
    );

    if (poRows.length === 0) {
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    const [itemRows] = await db.query(
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
        w.name AS requested_warehouse_name,
        w.code AS requested_warehouse_code
      FROM purchase_order_items poi
      INNER JOIN products p ON poi.product_id = p.id
      LEFT JOIN warehouses w ON w.id = poi.requested_warehouse_id
      WHERE poi.purchase_order_id = ?
      ORDER BY poi.id ASC
      `,
      [id]
    );

    const items = itemRows.map((item) => ({
      ...item,
      pending_quantity:
        Math.max(0, Number(item.quantity) - Number(item.received_quantity)) || 0,
    }));

    res.json({
      ...poRows[0],
      items,
    });
  } catch (error) {
    console.error('Get purchase order for receipt error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch purchase order details' });
  }
};

export const getGoodsReceipts = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      search = '',
      warehouse_id = '',
      purchase_order_id = '',
      status = '',
    } = req.query;

    let sql = `
      SELECT
        gr.*,
        po.po_number,
        po.order_date,
        po.status AS po_status,
        po.source_type,
        s.name AS supplier_name,
        w.name AS warehouse_name,
        w.code AS warehouse_code
      FROM goods_receipts gr
      INNER JOIN purchase_orders po ON gr.purchase_order_id = po.id
      INNER JOIN suppliers s ON po.supplier_id = s.id
      INNER JOIN warehouses w ON gr.warehouse_id = w.id
      WHERE 1 = 1 ${buildGoodsReceiptScope(scope, 'gr').sql}
    `;
    const values = [...buildGoodsReceiptScope(scope, 'gr').values];

    if (warehouse_id) {
      sql += ` AND gr.warehouse_id = ?`;
      values.push(warehouse_id);
    }

    if (purchase_order_id) {
      sql += ` AND gr.purchase_order_id = ?`;
      values.push(purchase_order_id);
    }

    if (status) {
      sql += ` AND gr.status = ?`;
      values.push(status);
    }

    if (search) {
      sql += `
        AND (
          gr.gr_number LIKE ?
          OR po.po_number LIKE ?
          OR s.name LIKE ?
        )
      `;
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY gr.receipt_date DESC, gr.id DESC`;

    const [rows] = await db.query(sql, values);
    res.json(rows);
  } catch (error) {
    console.error('Get goods receipts error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch goods receipts' });
  }
};

export const getGoodsReceiptById = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { id } = req.params;

    const [headerRows] = await db.query(
      `
      SELECT
        gr.*,
        po.po_number,
        po.order_date,
        po.status AS po_status,
        po.source_type,
        po.source_reference_id,
        s.name AS supplier_name,
        w.name AS warehouse_name,
        w.code AS warehouse_code
      FROM goods_receipts gr
      INNER JOIN purchase_orders po ON gr.purchase_order_id = po.id
      INNER JOIN suppliers s ON po.supplier_id = s.id
      INNER JOIN warehouses w ON gr.warehouse_id = w.id
      WHERE gr.id = ? ${buildGoodsReceiptScope(scope, 'gr').sql}
      `,
      [id, ...buildGoodsReceiptScope(scope, 'gr').values]
    );

    if (headerRows.length === 0) {
      return res.status(404).json({ message: 'Goods receipt not found' });
    }

    const [itemRows] = await db.query(
      `
      SELECT
        gri.*,
        p.name AS product_name,
        p.sku,
        rw.name AS requested_warehouse_name,
        rw.code AS requested_warehouse_code
      FROM goods_receipt_items gri
      INNER JOIN products p ON gri.product_id = p.id
      LEFT JOIN warehouses rw ON rw.id = gri.requested_warehouse_id
      WHERE gri.goods_receipt_id = ?
      ORDER BY gri.id ASC
      `,
      [id]
    );

    res.json({
      ...headerRows[0],
      items: itemRows,
    });
  } catch (error) {
    console.error('Get goods receipt by id error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch goods receipt details' });
  }
};

export const createGoodsReceipt = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const scope = requireDataScope(req);

    const {
      purchase_order_id,
      warehouse_id,
      receipt_date,
      remarks,
      items = [],
      use_suggestions = false,
      auto_post = true,
    } = req.body;

    const purchaseOrderId = Number(purchase_order_id);
    const warehouseId = Number(warehouse_id);

    if (!purchaseOrderId || !warehouseId || !receipt_date) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid goods receipt data' });
    }

    const [poRows] = await connection.query(
      `
      SELECT *
      FROM purchase_orders
      WHERE id = ? ${buildPurchaseOrderScope(scope).sql}
      FOR UPDATE
      `,
      [purchaseOrderId, ...buildPurchaseOrderScope(scope).values]
    );

    if (poRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    const purchaseOrder = poRows[0];

    if (purchaseOrder.status === 'Cancelled') {
      await connection.rollback();
      return res.status(400).json({ message: 'Cancelled purchase order cannot be received' });
    }

    if (purchaseOrder.status === 'Received') {
      await connection.rollback();
      return res.status(400).json({ message: 'Purchase order is already fully received' });
    }

    await assertWarehouseInScope(connection, warehouseId, scope);

    const [poItemRows] = await connection.query(
      `
      SELECT
        poi.*,
        p.name AS product_name,
        p.sku
      FROM purchase_order_items poi
      INNER JOIN products p ON poi.product_id = p.id
      WHERE poi.purchase_order_id = ?
      FOR UPDATE
      `,
      [purchaseOrderId]
    );

    if (poItemRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Purchase order has no items' });
    }

    const poItemMap = new Map();
    poItemRows.forEach((row) => {
      poItemMap.set(Number(row.id), row);
    });

    let receiptItems = [];

    if (use_suggestions) {
      receiptItems = poItemRows
        .map((item) => {
          const requestedWarehouseId = Number(item.requested_warehouse_id) || null;
          const orderedQty = Number(item.quantity) || 0;
          const receivedQty = Number(item.received_quantity) || 0;
          const remaining = Math.max(0, orderedQty - receivedQty);

          if (remaining <= 0) return null;

          if (requestedWarehouseId && requestedWarehouseId !== warehouseId) {
            return null;
          }

          return {
            purchase_order_item_id: Number(item.id),
            received_quantity: remaining,
          };
        })
        .filter(Boolean);
    } else {
      if (!Array.isArray(items)) {
        await connection.rollback();
        return res.status(400).json({ message: 'items must be an array' });
      }

      receiptItems = items
        .map((item) => ({
          purchase_order_item_id: Number(item.purchase_order_item_id),
          received_quantity: Number(item.received_quantity),
        }))
        .filter(
          (item) =>
            item.purchase_order_item_id > 0 &&
            item.received_quantity > 0
        );
    }

    if (receiptItems.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        message:
          'Please enter at least one received quantity greater than zero, or use warehouse-matching suggestions',
      });
    }

    for (const item of receiptItems) {
      const poItem = poItemMap.get(item.purchase_order_item_id);

      if (!poItem) {
        await connection.rollback();
        return res.status(400).json({
          message: `PO item ${item.purchase_order_item_id} does not belong to this purchase order`,
        });
      }

      const orderedQty = Number(poItem.quantity) || 0;
      const receivedQty = Number(poItem.received_quantity) || 0;
      const pendingQty = orderedQty - receivedQty;

      if (pendingQty <= 0) {
        await connection.rollback();
        return res.status(400).json({
          message: `${poItem.product_name} is already fully received`,
        });
      }

      if (item.received_quantity > pendingQty) {
        await connection.rollback();
        return res.status(400).json({
          message: `${poItem.product_name} receipt exceeds pending quantity`,
        });
      }

      if (
        poItem.requested_warehouse_id &&
        Number(poItem.requested_warehouse_id) !== warehouseId
      ) {
        await connection.rollback();
        return res.status(400).json({
          message: `${poItem.product_name} is assigned to a different requested warehouse`,
        });
      }
    }

    const grNumber = `GR-${Date.now()}`;

    const initialStatus = auto_post ? 'Posted' : 'Draft';

    const [grResult] = await connection.query(
      `
      INSERT INTO goods_receipts
      (
        gr_number,
        purchase_order_id,
        warehouse_id,
        receipt_date,
        remarks,
        status,
        posted_at,
        posted_by,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        grNumber,
        purchaseOrderId,
        warehouseId,
        receipt_date,
        remarks || null,
        initialStatus,
        auto_post ? new Date() : null,
        auto_post ? req.user?.id || null : null,
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
      ]
    );

    const goodsReceiptId = grResult.insertId;
    const touchedProductIds = new Set();

    for (const item of receiptItems) {
      const poItem = poItemMap.get(item.purchase_order_item_id);
      const productId = Number(poItem.product_id);
      const qty = Number(item.received_quantity);
      const unitCost = Number(poItem.unit_cost) || 0;
      const lineTotal = qty * unitCost;

      const orderedQty = Number(poItem.quantity) || 0;
      const alreadyReceivedQty = Number(poItem.received_quantity) || 0;
      const remainingPoQty = Math.max(0, orderedQty - alreadyReceivedQty);

      const [griResult] = await connection.query(
        `
        INSERT INTO goods_receipt_items
        (
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
          poItem.id,
          poItem.purchase_requisition_item_id || null,
          productId,
          poItem.requested_warehouse_id || null,
          qty,
          remainingPoQty,
          remainingPoQty,
          unitCost,
          lineTotal,
        ]
      );

      await connection.query(
        `
        UPDATE purchase_order_items
        SET received_quantity = received_quantity + ?
        WHERE id = ?
        `,
        [qty, poItem.id]
      );

      const stockState = await syncInventoryValuation(
        connection,
        productId,
        warehouseId,
        qty,
        unitCost
      );

      await connection.query(
        `
        INSERT INTO stock_movements
        (
          product_id,
          warehouse_id,
          movement_type,
          reference_type,
          reference_id,
          quantity,
          previous_quantity,
          new_quantity,
          note,
          company_id,
          branch_id,
          business_unit_id
        )
        VALUES (?, ?, 'Restock', 'Goods Receipt', ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          productId,
          warehouseId,
          goodsReceiptId,
          qty,
          stockState.previousQty,
          stockState.newQty,
          `${grNumber} from PO ${purchaseOrder.po_number}`,
          scope.company_id,
          scope.branch_id,
          scope.business_unit_id,
        ]
      );

      await insertInventoryLedgerEntry({
        connection,
        receiptDate: receipt_date,
        goodsReceiptId,
        goodsReceiptItemId: griResult.insertId,
        productId,
        warehouseId,
        quantity: qty,
        unitCost,
        stockState,
        remarks: `${grNumber} from PO ${purchaseOrder.po_number}`,
        userId: req.user?.id || null,
      });

      touchedProductIds.add(productId);
    }

    const [statusRows] = await connection.query(
      `
      SELECT
        COUNT(*) AS total_items,
        SUM(CASE WHEN received_quantity >= quantity THEN 1 ELSE 0 END) AS fully_received_items,
        COALESCE(SUM(received_quantity), 0) AS total_received
      FROM purchase_order_items
      WHERE purchase_order_id = ?
      `,
      [purchaseOrderId]
    );

    const statusRow = statusRows[0];
    const totalItems = Number(statusRow.total_items) || 0;
    const fullyReceivedItems = Number(statusRow.fully_received_items) || 0;
    const totalReceived = Number(statusRow.total_received) || 0;

    let poStatus = 'Pending';
    if (totalItems > 0 && fullyReceivedItems === totalItems) {
      poStatus = 'Received';
    } else if (totalReceived > 0) {
      poStatus = 'Partial';
    }

    await connection.query(
      `
      UPDATE purchase_orders
      SET status = ?, received_at = CASE WHEN ? = 'Received' THEN NOW() ELSE received_at END
      WHERE id = ?
      `,
      [poStatus, poStatus, purchaseOrderId]
    );

    for (const productId of touchedProductIds) {
      await syncProductTotalFromWarehouses(connection, productId);
    }

    await connection.commit();

    const [receiptRows] = await connection.query(
      `
      SELECT
        gr.*,
        po.po_number,
        po.order_date,
        po.status AS po_status,
        po.source_type,
        po.source_reference_id,
        s.name AS supplier_name,
        w.name AS warehouse_name,
        w.code AS warehouse_code
      FROM goods_receipts gr
      INNER JOIN purchase_orders po ON gr.purchase_order_id = po.id
      INNER JOIN suppliers s ON po.supplier_id = s.id
      INNER JOIN warehouses w ON gr.warehouse_id = w.id
      WHERE gr.id = ?
      `,
      [goodsReceiptId, ...buildGoodsReceiptScope(scope).values]
    );

    const [receiptItemRows] = await connection.query(
      `
      SELECT
        gri.*,
        p.name AS product_name,
        p.sku,
        rw.name AS requested_warehouse_name,
        rw.code AS requested_warehouse_code
      FROM goods_receipt_items gri
      INNER JOIN products p ON gri.product_id = p.id
      LEFT JOIN warehouses rw ON rw.id = gri.requested_warehouse_id
      WHERE gri.goods_receipt_id = ?
      ORDER BY gri.id ASC
      `,
      [goodsReceiptId]
    );

    res.status(201).json({
      ...receiptRows[0],
      items: receiptItemRows,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create goods receipt error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create goods receipt' });
  } finally {
    connection.release();
  }
};

export const postGoodsReceipt = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const scope = requireDataScope(req);

    const goodsReceiptId = Number(req.params.id);

    if (!goodsReceiptId) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid goods receipt id' });
    }

    const [headerRows] = await connection.query(
      `
      SELECT *
      FROM goods_receipts
      WHERE id = ? ${buildPurchaseOrderScope(scope).sql}
      FOR UPDATE
      `,
      [goodsReceiptId]
    );

    if (headerRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Goods receipt not found' });
    }

    const header = headerRows[0];

    if (header.status !== 'Draft') {
      await connection.rollback();
      return res.status(400).json({ message: 'Only draft goods receipts can be posted' });
    }

    const [itemRows] = await connection.query(
      `
      SELECT *
      FROM goods_receipt_items
      WHERE goods_receipt_id = ?
      FOR UPDATE
      `,
      [goodsReceiptId]
    );

    if (itemRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Draft goods receipt has no items' });
    }

    const [poItemRows] = await connection.query(
      `
      SELECT *
      FROM purchase_order_items
      WHERE purchase_order_id = ?
      FOR UPDATE
      `,
      [header.purchase_order_id]
    );

    const poItemMap = new Map();
    poItemRows.forEach((row) => poItemMap.set(Number(row.id), row));

    const touchedProductIds = new Set();

    for (const item of itemRows) {
      const poItem = poItemMap.get(Number(item.purchase_order_item_id));

      if (!poItem) {
        await connection.rollback();
        return res.status(400).json({
          message: `Purchase order item ${item.purchase_order_item_id} not found`,
        });
      }

      const pendingQty =
        (Number(poItem.quantity) || 0) - (Number(poItem.received_quantity) || 0);

      if (Number(item.received_quantity) > pendingQty) {
        await connection.rollback();
        return res.status(400).json({
          message: `Receipt quantity exceeds pending quantity for PO item ${poItem.id}`,
        });
      }

      await connection.query(
        `
        UPDATE purchase_order_items
        SET received_quantity = received_quantity + ?
        WHERE id = ?
        `,
        [Number(item.received_quantity), poItem.id]
      );

      const stockState = await syncInventoryValuation(
        connection,
        Number(item.product_id),
        Number(header.warehouse_id),
        Number(item.received_quantity),
        Number(item.unit_cost)
      );

      await connection.query(
        `
        INSERT INTO stock_movements
        (
          product_id,
          warehouse_id,
          movement_type,
          reference_type,
          reference_id,
          quantity,
          previous_quantity,
          new_quantity,
          note,
          company_id,
          branch_id,
          business_unit_id
        )
        VALUES (?, ?, 'Restock', 'Goods Receipt', ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          Number(item.product_id),
          Number(header.warehouse_id),
          goodsReceiptId,
          Number(item.received_quantity),
          stockState.previousQty,
          stockState.newQty,
          `${header.gr_number} from PO ${header.purchase_order_id}`,
          scope.company_id,
          scope.branch_id,
          scope.business_unit_id,
        ]
      );

      await insertInventoryLedgerEntry({
        connection,
        receiptDate: header.receipt_date,
        goodsReceiptId,
        goodsReceiptItemId: Number(item.id),
        productId: Number(item.product_id),
        warehouseId: Number(header.warehouse_id),
        quantity: Number(item.received_quantity),
        unitCost: Number(item.unit_cost),
        stockState,
        remarks: `${header.gr_number} posted`,
        userId: req.user?.id || null,
      });

      touchedProductIds.add(Number(item.product_id));
    }

    const [statusRows] = await connection.query(
      `
      SELECT
        COUNT(*) AS total_items,
        SUM(CASE WHEN received_quantity >= quantity THEN 1 ELSE 0 END) AS fully_received_items,
        COALESCE(SUM(received_quantity), 0) AS total_received
      FROM purchase_order_items
      WHERE purchase_order_id = ?
      `,
      [header.purchase_order_id]
    );

    const statusRow = statusRows[0];
    const totalItems = Number(statusRow.total_items) || 0;
    const fullyReceivedItems = Number(statusRow.fully_received_items) || 0;
    const totalReceived = Number(statusRow.total_received) || 0;

    let poStatus = 'Pending';
    if (totalItems > 0 && fullyReceivedItems === totalItems) {
      poStatus = 'Received';
    } else if (totalReceived > 0) {
      poStatus = 'Partial';
    }

    await connection.query(
      `
      UPDATE purchase_orders
      SET status = ?, received_at = CASE WHEN ? = 'Received' THEN NOW() ELSE received_at END
      WHERE id = ?
      `,
      [poStatus, poStatus, header.purchase_order_id]
    );

    await connection.query(
      `
      UPDATE goods_receipts
      SET status = 'Posted',
          posted_at = NOW(),
          posted_by = ?
      WHERE id = ?
      `,
      [req.user?.id || null, goodsReceiptId]
    );

    for (const productId of touchedProductIds) {
      await syncProductTotalFromWarehouses(connection, productId);
    }

    await connection.commit();

    const [receiptRows] = await connection.query(
      `
      SELECT
        gr.*,
        po.po_number,
        po.order_date,
        po.status AS po_status,
        po.source_type,
        po.source_reference_id,
        s.name AS supplier_name,
        w.name AS warehouse_name,
        w.code AS warehouse_code
      FROM goods_receipts gr
      INNER JOIN purchase_orders po ON gr.purchase_order_id = po.id
      INNER JOIN suppliers s ON po.supplier_id = s.id
      INNER JOIN warehouses w ON gr.warehouse_id = w.id
      WHERE gr.id = ? ${buildGoodsReceiptScope(scope, 'gr').sql}
      `,
      [goodsReceiptId, ...buildGoodsReceiptScope(scope, 'gr').values]
    );

    const [receiptItemRows] = await connection.query(
      `
      SELECT
        gri.*,
        p.name AS product_name,
        p.sku,
        rw.name AS requested_warehouse_name,
        rw.code AS requested_warehouse_code
      FROM goods_receipt_items gri
      INNER JOIN products p ON gri.product_id = p.id
      LEFT JOIN warehouses rw ON rw.id = gri.requested_warehouse_id
      WHERE gri.goods_receipt_id = ?
      ORDER BY gri.id ASC
      `,
      [goodsReceiptId]
    );

    res.json({
      ...receiptRows[0],
      items: receiptItemRows,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Post goods receipt error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to post goods receipt' });
  } finally {
    connection.release();
  }
};
