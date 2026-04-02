import db from '../config/db.js';
import { createAuditLog, getRequestIp } from '../utils/auditTrail.js';
import {
  createJournalEntry,
  getAccountsByCodes,
  getJournalEntriesByReferenceTypes,
} from '../utils/journalPosting.js';
import { increaseWarehouseStock } from '../utils/inventoryStock.js';
import { ensurePostingDateIsOpen } from '../utils/postingLock.js';
import { buildScopeWhereClause, requireDataScope } from '../middleware/dataScopeMiddleware.js';
import {
  normalizePurchaseLine,
  normalizeReceiptLine,
  resolveProductFromVendorSku,
} from '../utils/itemMasterResolvers.js';

const getStockStatus = (quantity) => {
  const qty = Number(quantity) || 0;

  if (qty <= 0) return 'Out of Stock';
  if (qty <= 10) return 'Low Stock';
  return 'In Stock';
};

const syncProductTotalFromWarehouses = async (connection, productId) => {
  const [[stockRow]] = await connection.query(
    `
    SELECT COALESCE(SUM(quantity), 0) AS total_quantity
    FROM inventory_stocks
    WHERE product_id = ?
    `,
    [productId]
  );

  const totalQuantity = Number(stockRow.total_quantity) || 0;
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

const getPurchaseOrderWithItems = async (connection, purchaseOrderId) => {
  const [poRows] = await connection.query(
    `
    SELECT
      po.*,
      s.name AS supplier_name,
      s.contact_person,
      s.email AS supplier_email,
      s.phone AS supplier_phone
    FROM purchase_orders po
    INNER JOIN suppliers s ON po.supplier_id = s.id
    WHERE po.id = ?
    `,
    [purchaseOrderId]
  );

  if (poRows.length === 0) return null;

  const [itemRows] = await connection.query(
    `
    SELECT
      poi.*,
      p.name AS product_name,
      p.sku,
      p.uom,
      p.alternate_uoms_json,
      p.vendor_item_mappings_json,
      p.inventory_tracking_type,
      p.is_lot_tracked,
      p.is_serial_tracked,
      p.is_expiry_tracked
    FROM purchase_order_items poi
    INNER JOIN products p ON poi.product_id = p.id
    WHERE poi.purchase_order_id = ?
    ORDER BY poi.id ASC
    `,
    [purchaseOrderId]
  );

  return {
    ...poRows[0],
    items: itemRows,
  };
};

const getGoodsReceiptBilledMap = async (connection, purchaseOrderId) => {
  const [rows] = await connection.query(
    `
    SELECT
      aii.purchase_order_item_id,
      COALESCE(SUM(aii.billed_quantity), 0) AS total_billed_quantity
    FROM ap_invoice_items aii
    INNER JOIN ap_invoices ai ON aii.ap_invoice_id = ai.id
    INNER JOIN purchase_order_items poi ON aii.purchase_order_item_id = poi.id
    WHERE poi.purchase_order_id = ?
      AND ai.status <> 'Cancelled'
    GROUP BY aii.purchase_order_item_id
    `,
    [purchaseOrderId]
  );

  const billedMap = new Map();

  for (const row of rows) {
    billedMap.set(
      Number(row.purchase_order_item_id),
      Number(row.total_billed_quantity) || 0
    );
  }

  return billedMap;
};

const getApInvoiceWithItems = async (connection, invoiceId) => {
  const [invoiceRows] = await connection.query(
    `
    SELECT
      ai.*,
      po.po_number,
      s.name AS supplier_name
    FROM ap_invoices ai
    INNER JOIN purchase_orders po ON ai.purchase_order_id = po.id
    INNER JOIN suppliers s ON ai.supplier_id = s.id
    WHERE ai.id = ?
    `,
    [invoiceId]
  );

  if (invoiceRows.length === 0) return null;

  const [itemRows] = await connection.query(
    `
    SELECT
      aii.*,
      p.name AS product_name,
      p.sku
    FROM ap_invoice_items aii
    INNER JOIN products p ON aii.product_id = p.id
    WHERE aii.ap_invoice_id = ?
    ORDER BY aii.id ASC
    `,
    [invoiceId]
  );

  return {
    ...invoiceRows[0],
    items: itemRows,
  };
};

const assertWarehouseScopeAccess = async (connection, warehouseId, scope) => {
  const [[warehouse]] = await connection.query(
    `
    SELECT id, name, code, status, company_id, branch_id, business_unit_id
    FROM warehouses
    WHERE id = ?
    LIMIT 1
    `,
    [warehouseId]
  );

  if (!warehouse) {
    throw new Error('Warehouse not found');
  }

  if (warehouse.status !== 'Active') {
    throw new Error('Warehouse is inactive');
  }

  if (
    Number(warehouse.company_id || 0) !== Number(scope.company_id || 0) ||
    Number(warehouse.branch_id || 0) !== Number(scope.branch_id || 0) ||
    Number(warehouse.business_unit_id || 0) !== Number(scope.business_unit_id || 0)
  ) {
    throw new Error('Warehouse does not belong to your active scope');
  }

  return warehouse;
};

export const getPurchaseJournalEntries = async (req, res) => {
  try {
    const { company_id, branch_id, business_unit_id } = requireDataScope(req);

    const entries = await getJournalEntriesByReferenceTypes(db, [
      'AP Invoice',
      'AP Payment',
    ]);

    const filteredEntries = entries.filter((entry) => {
      if (entry.company_id == null) return true;

      return (
        Number(entry.company_id) === Number(company_id) &&
        Number(entry.branch_id || 0) === Number(branch_id || 0) &&
        Number(entry.business_unit_id || 0) === Number(business_unit_id || 0)
      );
    });

    res.json(filteredEntries);
  } catch (error) {
    console.error('Get purchase journal entries error:', error);
    res.status(500).json({ message: 'Failed to fetch purchase journal entries' });
  }
};

export const getPurchaseMeta = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const supplierScope = buildScopeWhereClause(scope, {
      company: 's.company_id',
      branch: 's.branch_id',
      businessUnit: 's.business_unit_id',
    });
    const productScope = buildScopeWhereClause(scope, {
      company: 'p.company_id',
      branch: 'p.branch_id',
      businessUnit: 'p.business_unit_id',
    });
    const warehouseScope = buildScopeWhereClause(scope, {
      company: 'w.company_id',
      branch: 'w.branch_id',
      businessUnit: 'w.business_unit_id',
    });

    const [suppliers] = await db.query(
      `
      SELECT s.id, s.name, s.contact_person, s.email, s.phone
      FROM suppliers s
      WHERE s.status = 'Active' ${supplierScope.sql}
      ORDER BY s.name ASC
      `,
      supplierScope.values
    );

    const [productRows] = await db.query(
      `
      SELECT 
        p.id, 
        p.name, 
        p.sku,
        p.uom,
        p.alternate_uoms_json,
        p.base_price, 
        p.market_price, 
        p.standard_cost,
        p.quantity, 
        p.status,
        p.vendor_item_mappings_json,
        p.inventory_tracking_type,
        p.is_lot_tracked,
        p.is_serial_tracked,
        p.is_expiry_tracked
      FROM products p
      WHERE 1 = 1 ${productScope.sql}
      ORDER BY p.name ASC
      `,
      productScope.values
    );

    const products = productRows.map((row) => ({
      ...row,
      alternate_uoms: (() => {
        try {
          return JSON.parse(row.alternate_uoms_json || '[]');
        } catch {
          return [];
        }
      })(),
      vendor_item_mappings: (() => {
        try {
          return JSON.parse(row.vendor_item_mappings_json || '[]');
        } catch {
          return [];
        }
      })(),
    }));

    const [warehouses] = await db.query(
      `
      SELECT w.id, w.name, w.code, w.address, w.status
      FROM warehouses w
      WHERE w.status = 'Active' ${warehouseScope.sql}
      ORDER BY w.name ASC
      `,
      warehouseScope.values
    );

    res.json({ suppliers, products, warehouses });
  } catch (error) {
    console.error('Get purchase meta error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to fetch purchase metadata',
    });
  }
};

export const getPurchaseOrders = async (req, res) => {
  try {
    const { company_id, branch_id, business_unit_id } = requireDataScope(req);
    const { search = '', status = '', supplier_id = '' } = req.query;

    let sql = `
      SELECT
        po.*,
        s.name AS supplier_name
      FROM purchase_orders po
      INNER JOIN suppliers s ON po.supplier_id = s.id
      WHERE 1 = 1
    `;
    const values = [];

    const scopeClause = buildScopeWhereClause(
      { company_id, branch_id, business_unit_id },
      {
        company: 'po.company_id',
        branch: 'po.branch_id',
        businessUnit: 'po.business_unit_id',
      }
    );

    sql += scopeClause.sql;
    values.push(...scopeClause.values);

    if (search) {
      sql += ` AND (po.po_number LIKE ? OR s.name LIKE ?)`;
      values.push(`%${search}%`, `%${search}%`);
    }

    if (status) {
      sql += ` AND po.status = ?`;
      values.push(status);
    }

    if (supplier_id) {
      sql += ` AND po.supplier_id = ?`;
      values.push(supplier_id);
    }

    sql += ` ORDER BY po.created_at DESC, po.id DESC`;

    const [poRows] = await db.query(sql, values);

    if (poRows.length === 0) {
      return res.json([]);
    }

    const poIds = poRows.map((row) => row.id);
    const [itemRows] = await db.query(
      `
      SELECT
        poi.*,
        p.name AS product_name,
        p.sku
      FROM purchase_order_items poi
      INNER JOIN products p ON poi.product_id = p.id
      WHERE poi.purchase_order_id IN (?)
      ORDER BY poi.purchase_order_id DESC, poi.id ASC
      `,
      [poIds]
    );

    const itemMap = new Map();

    for (const item of itemRows) {
      if (!itemMap.has(item.purchase_order_id)) {
        itemMap.set(item.purchase_order_id, []);
      }
      itemMap.get(item.purchase_order_id).push(item);
    }

    const result = poRows.map((po) => ({
      ...po,
      items: itemMap.get(po.id) || [],
    }));

    res.json(result);
  } catch (error) {
    console.error('Get purchase orders error:', error);
    res.status(500).json({ message: 'Failed to fetch purchase orders' });
  }
};

export const createPurchaseOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { company_id, branch_id, business_unit_id } = requireDataScope(req);
    const { supplier_id, order_date, notes, items } = req.body;

    if (!supplier_id || !order_date || !Array.isArray(items) || items.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid purchase order data' });
    }

    const productScope = buildScopeWhereClause(
      { company_id, branch_id, business_unit_id },
      {
        company: 'p.company_id',
        branch: 'p.branch_id',
        businessUnit: 'p.business_unit_id',
      }
    );

    const requestedProductIds = [
      ...new Set(
        items
          .map((item) => Number(item.product_id))
          .filter((id) => Number.isFinite(id) && id > 0)
      ),
    ];

    const loadAllProductsForVendorResolution = requestedProductIds.length !== items.length;

    const productQuery = loadAllProductsForVendorResolution
      ? `
        SELECT
          p.id,
          p.name,
          p.sku,
          p.uom,
          p.base_price,
          p.standard_cost,
          p.alternate_uoms_json,
          p.vendor_item_mappings_json,
          p.inventory_tracking_type,
          p.is_lot_tracked,
          p.is_serial_tracked,
          p.is_expiry_tracked
        FROM products p
        WHERE 1 = 1 ${productScope.sql}
      `
      : `
        SELECT
          p.id,
          p.name,
          p.sku,
          p.uom,
          p.base_price,
          p.standard_cost,
          p.alternate_uoms_json,
          p.vendor_item_mappings_json,
          p.inventory_tracking_type,
          p.is_lot_tracked,
          p.is_serial_tracked,
          p.is_expiry_tracked
        FROM products p
        WHERE p.id IN (?) ${productScope.sql}
      `;

    const productParams = loadAllProductsForVendorResolution
      ? [...productScope.values]
      : [requestedProductIds, ...productScope.values];

    const [productRows] = await connection.query(productQuery, productParams);

    const productMap = new Map(productRows.map((row) => [Number(row.id), row]));

    const normalizedItems = [];

    for (const item of items) {
      let product = null;

      if (Number(item.product_id) > 0) {
        product = productMap.get(Number(item.product_id)) || null;
      } else if (item.vendor_sku) {
        const resolved = resolveProductFromVendorSku({
          products: productRows,
          supplierId: Number(supplier_id),
          vendorSku: item.vendor_sku,
        });

        product = resolved?.product || null;
      }

      if (!product) {
        throw new Error(
          item.vendor_sku
            ? `No in-scope product matches vendor SKU ${item.vendor_sku}`
            : `Product not found: ${item.product_id}`
        );
      }

      const normalized = normalizePurchaseLine({
        item,
        product,
        supplierId: Number(supplier_id),
        quantity: item.quantity,
        unitCost: item.unit_cost,
        vendorSku: item.vendor_sku,
        uomCode: item.uom_code,
      });

      normalizedItems.push({
        ...normalized,
        product_id: Number(normalized.product_id || product.id),
      });
    }

    if (normalizedItems.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Add at least one valid PO item' });
    }

    const totalAmount = normalizedItems.reduce(
      (sum, item) => sum + Number(item.line_total || 0),
      0
    );

    const poNumber = `PO-${Date.now()}`;

    const [poResult] = await connection.query(
      `
      INSERT INTO purchase_orders
      (
        po_number,
        supplier_id,
        order_date,
        status,
        notes,
        total_amount,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?, ?)
      `,
      [
        poNumber,
        supplier_id,
        order_date,
        notes || null,
        totalAmount,
        company_id,
        branch_id,
        business_unit_id,
      ]
    );

    for (const item of normalizedItems) {
      await connection.query(
        `
        INSERT INTO purchase_order_items
        (
          purchase_order_id,
          product_id,
          vendor_sku,
          requested_uom_code,
          base_uom_code,
          conversion_factor,
          requested_quantity,
          base_quantity,
          quantity,
          received_quantity,
          requested_unit_cost,
          base_unit_cost,
          unit_cost,
          line_total
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        `,
        [
          poResult.insertId,
          item.product_id,
          item.vendor_sku,
          item.requested_uom_code,
          item.base_uom_code,
          item.conversion_factor,
          item.requested_quantity,
          item.base_quantity,
          item.base_quantity,
          item.requested_unit_cost,
          item.base_unit_cost,
          item.base_unit_cost,
          item.line_total,
        ]
      );
    }

    await connection.commit();

    const purchaseOrderId = poResult.insertId;

    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'CREATE',
        moduleName: 'Purchase Orders',
        recordId: purchaseOrderId,
        description: `Created purchase order ${poNumber}`,
        newValues: {
          purchase_order_id: purchaseOrderId,
          po_number: poNumber,
          supplier_id,
          order_date,
          notes: notes || null,
          status: 'Pending',
          total_amount: totalAmount,
          company_id,
          branch_id,
          business_unit_id,
          items: normalizedItems,
        },
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('Create purchase order audit log error:', auditError);
    }

    const purchaseOrder = await getPurchaseOrderWithItems(connection, purchaseOrderId);

    res.status(201).json(purchaseOrder);
  } catch (error) {
    await connection.rollback();
    console.error('Create purchase order error:', error);
    res.status(500).json({ message: error.message || 'Failed to create purchase order' });
  } finally {
    connection.release();
  }
};

export const receivePurchaseOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { company_id, branch_id, business_unit_id } = requireDataScope(req);
    const { id } = req.params;
    const { warehouse_id, receipt_date, remarks, items } = req.body;

    const purchaseOrderId = Number(id);
    const warehouseId = Number(warehouse_id);

    if (
      !purchaseOrderId ||
      !warehouseId ||
      !receipt_date ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid goods receipt data' });
    }

    const purchaseOrder = await getPurchaseOrderWithItems(connection, purchaseOrderId);

    if (!purchaseOrder) {
      await connection.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    if (
      Number(purchaseOrder.company_id || 0) !== Number(company_id || 0) ||
      Number(purchaseOrder.branch_id || 0) !== Number(branch_id || 0) ||
      Number(purchaseOrder.business_unit_id || 0) !== Number(business_unit_id || 0)
    ) {
      await connection.rollback();
      return res.status(403).json({ message: 'Purchase order is outside your active scope' });
    }

    if (purchaseOrder.status === 'Cancelled') {
      await connection.rollback();
      return res.status(400).json({ message: 'Cancelled PO cannot be received' });
    }

    await assertWarehouseScopeAccess(connection, warehouseId, requireDataScope(req));

    const poItemMap = new Map();
    for (const item of purchaseOrder.items) {
      poItemMap.set(Number(item.id), item);
    }

    const receiptItems = items
      .map((item) => ({
        purchase_order_item_id: Number(item.purchase_order_item_id),
        ...item,
      }))
      .filter((item) => item.purchase_order_item_id > 0 && Number(item.received_quantity) > 0);

    if (receiptItems.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Enter at least one received quantity' });
    }

    const normalizedReceiptItems = [];

    for (const item of receiptItems) {
      const poItem = poItemMap.get(Number(item.purchase_order_item_id));

      if (!poItem) {
        throw new Error(`PO item not found: ${item.purchase_order_item_id}`);
      }

      const normalized = normalizeReceiptLine({
        item: {
          ...item,
          quantity: item.received_quantity,
          unit_cost: item.unit_cost ?? poItem.requested_unit_cost ?? poItem.unit_cost,
          vendor_sku: item.vendor_sku || poItem.vendor_sku || null,
          uom_code:
            item.uom_code ||
            poItem.requested_uom_code ||
            poItem.uom_code ||
            poItem.uom ||
            null,
        },
        product: poItem,
        supplierId: Number(purchaseOrder.supplier_id),
      });

      normalizedReceiptItems.push({
        ...normalized,
        product_id: Number(normalized.product_id || poItem.product_id),
        purchase_order_item_id: Number(poItem.id),
        lot_number: item.lot_number || null,
        expiry_date: item.expiry_date || null,
        serial_numbers_json: Array.isArray(item.serial_numbers_json)
          ? item.serial_numbers_json
          : [],
      });
    }

    for (const item of normalizedReceiptItems) {
      const poItem = poItemMap.get(item.purchase_order_item_id);

      const remainingQty =
        Number(poItem.quantity || 0) - Number(poItem.received_quantity || 0);
      const baseReceivedQuantity = Number(item.base_quantity || item.received_quantity || 0);
      const requestedReceivedQuantity = Number(
        item.requested_quantity || item.received_quantity || 0
      );

      if (baseReceivedQuantity > remainingQty) {
        await connection.rollback();
        return res.status(400).json({
          message: `Received quantity exceeds remaining quantity for ${poItem.product_name}`,
        });
      }

      if (
        (poItem.is_lot_tracked || poItem.inventory_tracking_type === 'LOT') &&
        !item.lot_number
      ) {
        await connection.rollback();
        return res.status(400).json({
          message: `${poItem.product_name} requires lot_number`,
        });
      }

      if (poItem.is_expiry_tracked && !item.expiry_date) {
        await connection.rollback();
        return res.status(400).json({
          message: `${poItem.product_name} requires expiry_date`,
        });
      }

      if (
        (poItem.is_serial_tracked || poItem.inventory_tracking_type === 'SERIAL') &&
        item.serial_numbers_json.length !== requestedReceivedQuantity
      ) {
        await connection.rollback();
        return res.status(400).json({
          message: `${poItem.product_name} serial count must match received quantity`,
        });
      }
    }

    const grNumber = `GR-${Date.now()}`;

    const [grResult] = await connection.query(
      `
      INSERT INTO goods_receipts
      (gr_number, purchase_order_id, warehouse_id, receipt_date, remarks)
      VALUES (?, ?, ?, ?, ?)
      `,
      [grNumber, purchaseOrderId, warehouseId, receipt_date, remarks || null]
    );

    const goodsReceiptId = grResult.insertId;
    const touchedProducts = new Set();

    for (const item of normalizedReceiptItems) {
      const poItem = poItemMap.get(item.purchase_order_item_id);
      const productId = Number(item.product_id || poItem.product_id);
      const baseQuantity = Number(item.base_quantity || item.received_quantity || 0);
      const requestedQuantity = Number(item.requested_quantity || item.received_quantity || 0);
      const baseUnitCost = Number(item.base_unit_cost || poItem.base_unit_cost || poItem.unit_cost || 0);
      const requestedUnitCost = Number(
        item.requested_unit_cost || poItem.requested_unit_cost || poItem.unit_cost || 0
      );
      const lineTotal = baseQuantity * baseUnitCost;

      const [[beforeStockRow]] = await connection.query(
        `
        SELECT COALESCE(quantity, 0) AS quantity
        FROM inventory_stocks
        WHERE product_id = ?
          AND warehouse_id = ?
          AND company_id = ?
          AND branch_id = ?
          AND business_unit_id = ?
        LIMIT 1
        `,
        [
          productId,
          warehouseId,
          company_id,
          branch_id,
          business_unit_id,
        ]
      );

      const previousQuantity = Number(beforeStockRow?.quantity || 0);

      const [griResult] = await connection.query(
        `
        INSERT INTO goods_receipt_items
        (
          goods_receipt_id,
          purchase_order_item_id,
          product_id,
          vendor_sku,
          requested_uom_code,
          base_uom_code,
          conversion_factor,
          requested_received_quantity,
          base_received_quantity,
          received_quantity,
          requested_unit_cost,
          base_unit_cost,
          unit_cost,
          line_total,
          lot_number,
          expiry_date,
          serial_numbers_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          goodsReceiptId,
          item.purchase_order_item_id,
          productId,
          item.vendor_sku || poItem.vendor_sku || null,
          item.requested_uom_code || poItem.requested_uom_code || poItem.uom || null,
          item.base_uom_code || poItem.base_uom_code || poItem.uom || null,
          Number(item.conversion_factor || 1),
          requestedQuantity,
          baseQuantity,
          baseQuantity,
          requestedUnitCost,
          baseUnitCost,
          baseUnitCost,
          lineTotal,
          item.lot_number,
          item.expiry_date,
          JSON.stringify(item.serial_numbers_json || []),
        ]
      );

      await connection.query(
        `
        UPDATE purchase_order_items
        SET received_quantity = received_quantity + ?
        WHERE id = ?
        `,
        [baseQuantity, poItem.id]
      );

      await connection.query(
        `
        INSERT INTO inventory_stocks (
          product_id,
          warehouse_id,
          quantity,
          total_value,
          company_id,
          branch_id,
          business_unit_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          quantity = quantity + VALUES(quantity),
          total_value = total_value + VALUES(total_value)
        `,
        [
          productId,
          warehouseId,
          baseQuantity,
          baseQuantity * baseUnitCost,
          company_id,
          branch_id,
          business_unit_id,
        ]
      );

      const newQuantity = previousQuantity + baseQuantity;

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
          note
        )
        VALUES (?, ?, 'Restock', 'Goods Receipt', ?, ?, ?, ?, ?)
        `,
        [
          productId,
          warehouseId,
          goodsReceiptId,
          baseQuantity,
          previousQuantity,
          newQuantity,
          `${grNumber} received from ${purchaseOrder.po_number}`,
        ]
      );

      touchedProducts.add(productId);
    }

    for (const productId of touchedProducts) {
      await syncProductTotalFromWarehouses(connection, productId);
    }

    const [[statusRow]] = await connection.query(
      `
      SELECT
        COUNT(*) AS total_lines,
        SUM(CASE WHEN received_quantity >= quantity THEN 1 ELSE 0 END) AS fully_received_lines,
        SUM(received_quantity) AS total_received_qty
      FROM purchase_order_items
      WHERE purchase_order_id = ?
      `,
      [purchaseOrderId]
    );

    let newPoStatus = 'Pending';

    if (
      Number(statusRow.total_lines) > 0 &&
      Number(statusRow.fully_received_lines) === Number(statusRow.total_lines)
    ) {
      newPoStatus = 'Received';
    } else if (Number(statusRow.total_received_qty) > 0) {
      newPoStatus = 'Partial';
    }

    await connection.query(
      `
      UPDATE purchase_orders
      SET status = ?, received_at = NOW()
      WHERE id = ?
      `,
      [newPoStatus, purchaseOrderId]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Goods receipt saved successfully',
      id: grResult.insertId,
      gr_number: grNumber,
      purchase_order_id: purchaseOrderId,
      warehouse_id: warehouseId,
      receipt_date,
      remarks: remarks || null,
      status: 'Posted',
    });
  } catch (error) {
    await connection.rollback();
    console.error('Receive purchase order error:', error);
    res.status(500).json({ message: error.message || 'Failed to receive purchase order' });
  } finally {
    connection.release();
  }
};

export const getGoodsReceipts = async (req, res) => {
  try {
    const { company_id, branch_id, business_unit_id } = requireDataScope(req);
    const { search = '', purchase_order_id = '', warehouse_id = '' } = req.query;

    let sql = `
      SELECT
        gr.*,
        po.po_number,
        s.name AS supplier_name,
        w.name AS warehouse_name,
        w.code AS warehouse_code
      FROM goods_receipts gr
      INNER JOIN purchase_orders po ON gr.purchase_order_id = po.id
      INNER JOIN suppliers s ON po.supplier_id = s.id
      INNER JOIN warehouses w ON gr.warehouse_id = w.id
      WHERE 1 = 1
    `;
    const values = [];

    sql += `
      AND po.company_id = ?
      AND po.branch_id = ?
      AND po.business_unit_id = ?
    `;
    values.push(company_id, branch_id, business_unit_id);

    if (search) {
      sql += ` AND (gr.gr_number LIKE ? OR po.po_number LIKE ? OR s.name LIKE ?)`;
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (purchase_order_id) {
      sql += ` AND gr.purchase_order_id = ?`;
      values.push(purchase_order_id);
    }

    if (warehouse_id) {
      sql += ` AND gr.warehouse_id = ?`;
      values.push(warehouse_id);
    }

    sql += ` ORDER BY gr.created_at DESC, gr.id DESC`;

    const [receiptRows] = await db.query(sql, values);

    if (receiptRows.length === 0) {
      return res.json([]);
    }

    const receiptIds = receiptRows.map((row) => row.id);

    const [itemRows] = await db.query(
      `
      SELECT
        gri.*,
        p.name AS product_name,
        p.sku,
        poi.quantity AS ordered_quantity,
        poi.received_quantity AS total_received_quantity
      FROM goods_receipt_items gri
      INNER JOIN products p ON gri.product_id = p.id
      INNER JOIN purchase_order_items poi ON gri.purchase_order_item_id = poi.id
      WHERE gri.goods_receipt_id IN (?)
      ORDER BY gri.goods_receipt_id DESC, gri.id ASC
      `,
      [receiptIds]
    );

    const itemMap = new Map();

    for (const item of itemRows) {
      if (!itemMap.has(item.goods_receipt_id)) {
        itemMap.set(item.goods_receipt_id, []);
      }
      itemMap.get(item.goods_receipt_id).push(item);
    }

    const result = receiptRows.map((receipt) => ({
      ...receipt,
      items: itemMap.get(receipt.id) || [],
    }));

    res.json(result);
  } catch (error) {
    console.error('Get goods receipts error:', error);
    res.status(500).json({ message: 'Failed to fetch goods receipts' });
  }
};

export const getApInvoices = async (req, res) => {
  try {
    const { company_id, branch_id, business_unit_id } = requireDataScope(req);
    const { search = '', status = '', supplier_id = '' } = req.query;

    let sql = `
      SELECT
        ai.*,
        po.po_number,
        s.name AS supplier_name
      FROM ap_invoices ai
      INNER JOIN purchase_orders po ON ai.purchase_order_id = po.id
      INNER JOIN suppliers s ON ai.supplier_id = s.id
      WHERE 1 = 1
    `;
    const values = [];

    sql += `
      AND ai.company_id = ?
      AND ai.branch_id = ?
      AND ai.business_unit_id = ?
    `;
    values.push(company_id, branch_id, business_unit_id);

    if (search) {
      sql += `
        AND (
          ai.invoice_number LIKE ?
          OR ai.supplier_invoice_number LIKE ?
          OR po.po_number LIKE ?
          OR s.name LIKE ?
        )
      `;
      values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
      sql += ` AND ai.status = ?`;
      values.push(status);
    }

    if (supplier_id) {
      sql += ` AND ai.supplier_id = ?`;
      values.push(supplier_id);
    }

    sql += ` ORDER BY ai.created_at DESC, ai.id DESC`;

    const [invoiceRows] = await db.query(sql, values);

    if (invoiceRows.length === 0) {
      return res.json([]);
    }

    const invoiceIds = invoiceRows.map((row) => row.id);

    const [itemRows] = await db.query(
      `
      SELECT
        aii.*,
        p.name AS product_name,
        p.sku
      FROM ap_invoice_items aii
      INNER JOIN products p ON aii.product_id = p.id
      WHERE aii.ap_invoice_id IN (?)
      ORDER BY aii.ap_invoice_id DESC, aii.id ASC
      `,
      [invoiceIds]
    );

    const itemMap = new Map();

    for (const item of itemRows) {
      if (!itemMap.has(item.ap_invoice_id)) {
        itemMap.set(item.ap_invoice_id, []);
      }
      itemMap.get(item.ap_invoice_id).push(item);
    }

    const result = invoiceRows.map((invoice) => ({
      ...invoice,
      items: itemMap.get(invoice.id) || [],
    }));

    res.json(result);
  } catch (error) {
    console.error('Get AP invoices error:', error);
    res.status(500).json({ message: 'Failed to fetch AP invoices' });
  }
};

export const getInvoiceablePurchaseOrders = async (req, res) => {
  try {
    const { company_id, branch_id, business_unit_id } = requireDataScope(req);

    const [poRows] = await db.query(
      `
      SELECT
        po.*,
        s.name AS supplier_name
      FROM purchase_orders po
      INNER JOIN suppliers s ON po.supplier_id = s.id
      WHERE po.status IN ('Partial', 'Received')
        AND po.company_id = ?
        AND po.branch_id = ?
        AND po.business_unit_id = ?
      ORDER BY po.created_at DESC, po.id DESC
      `,
      [company_id, branch_id, business_unit_id]
    );

    const result = [];

    for (const po of poRows) {
      const purchaseOrder = await getPurchaseOrderWithItems(db, po.id);
      const billedMap = await getGoodsReceiptBilledMap(db, po.id);

      const invoiceableItems = purchaseOrder.items
        .map((item) => {
          const billedQty = billedMap.get(Number(item.id)) || 0;
          const receivedQty = Number(item.received_quantity || 0);
          const availableToBill = receivedQty - billedQty;

          return {
            ...item,
            billed_quantity: billedQty,
            available_to_bill: availableToBill,
          };
        })
        .filter((item) => item.available_to_bill > 0);

      if (invoiceableItems.length > 0) {
        result.push({
          ...po,
          items: invoiceableItems,
        });
      }
    }

    res.json(result);
  } catch (error) {
    console.error('Get invoiceable purchase orders error:', error);
    res.status(500).json({ message: 'Failed to fetch invoiceable purchase orders' });
  }
};

export const createApInvoice = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { company_id, branch_id, business_unit_id } = requireDataScope(req);
    const {
      purchase_order_id,
      supplier_invoice_number,
      invoice_date,
      due_date,
      remarks,
      items,
    } = req.body;

    const purchaseOrderId = Number(purchase_order_id);

    if (
      !purchaseOrderId ||
      !supplier_invoice_number?.trim() ||
      !invoice_date ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid AP invoice data' });
    }

    const purchaseOrder = await getPurchaseOrderWithItems(connection, purchaseOrderId);

    if (!purchaseOrder) {
      await connection.rollback();
      return res.status(404).json({ message: 'Purchase order not found' });
    }

    if (
      Number(purchaseOrder.company_id || 0) !== Number(company_id || 0) ||
      Number(purchaseOrder.branch_id || 0) !== Number(branch_id || 0) ||
      Number(purchaseOrder.business_unit_id || 0) !== Number(business_unit_id || 0)
    ) {
      await connection.rollback();
      return res.status(403).json({ message: 'Purchase order is outside your active scope' });
    }

    if (!['Partial', 'Received'].includes(purchaseOrder.status)) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Only partially or fully received purchase orders can be invoiced',
      });
    }

    const poItemMap = new Map();
    for (const item of purchaseOrder.items) {
      poItemMap.set(Number(item.id), item);
    }

    const billedMap = await getGoodsReceiptBilledMap(connection, purchaseOrderId);

    const cleanedItems = items
      .map((item) => ({
        purchase_order_item_id: Number(item.purchase_order_item_id),
        billed_quantity: Number(item.billed_quantity),
      }))
      .filter((item) => item.purchase_order_item_id > 0 && item.billed_quantity > 0);

    if (cleanedItems.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Enter at least one billed quantity' });
    }

    for (const item of cleanedItems) {
      const poItem = poItemMap.get(item.purchase_order_item_id);

      if (!poItem) {
        await connection.rollback();
        return res.status(400).json({ message: 'One or more PO items are invalid' });
      }

      const receivedQty = Number(poItem.received_quantity || 0);
      const alreadyBilledQty = billedMap.get(Number(poItem.id)) || 0;
      const availableToBill = receivedQty - alreadyBilledQty;

      if (item.billed_quantity > availableToBill) {
        await connection.rollback();
        return res.status(400).json({
          message: `Billed quantity exceeds received-but-not-yet-billed quantity for ${poItem.product_name}`,
        });
      }
    }

    const totalAmount = cleanedItems.reduce((sum, item) => {
      const poItem = poItemMap.get(item.purchase_order_item_id);
      return sum + item.billed_quantity * Number(poItem.unit_cost || 0);
    }, 0);

    const invoiceNumber = `AP-${Date.now()}`;

    const [invoiceResult] = await connection.query(
      `
      INSERT INTO ap_invoices
      (
        invoice_number,
        supplier_invoice_number,
        purchase_order_id,
        supplier_id,
        invoice_date,
        due_date,
        status,
        remarks,
        total_amount,
        paid_amount,
        balance_amount,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, ?, ?, ?, ?, 'Open', ?, ?, 0, ?, ?, ?, ?)
      `,
      [
        invoiceNumber,
        supplier_invoice_number.trim(),
        purchaseOrderId,
        purchaseOrder.supplier_id,
        invoice_date,
        due_date || null,
        remarks || null,
        totalAmount,
        totalAmount,
        company_id,
        branch_id,
        business_unit_id,
      ]
    );

    for (const item of cleanedItems) {
      const poItem = poItemMap.get(item.purchase_order_item_id);
      const unitCost = Number(poItem.unit_cost || 0);
      const lineTotal = item.billed_quantity * unitCost;

      await connection.query(
        `
        INSERT INTO ap_invoice_items
        (
          ap_invoice_id,
          purchase_order_item_id,
          product_id,
          billed_quantity,
          unit_cost,
          line_total
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          invoiceResult.insertId,
          poItem.id,
          poItem.product_id,
          item.billed_quantity,
          unitCost,
          lineTotal,
        ]
      );
    }

    const accounts = await getAccountsByCodes(connection, ['1200', '2000']);

    if (!accounts['1200'] || !accounts['2000']) {
      throw new Error(
        'Required accounts not found. Please create Inventory Asset (1200) and Accounts Payable (2000).'
      );
    }

    await createJournalEntry(connection, {
      entry_date: invoice_date,
      reference_type: 'AP Invoice',
      reference_id: invoiceResult.insertId,
      memo: `AP invoice ${invoiceNumber} for PO ${purchaseOrder.po_number}`,
      company_id,
      branch_id,
      business_unit_id,
      lines: [
        {
          account_id: accounts['1200'].id,
          account_code: accounts['1200'].account_code,
          account_name: accounts['1200'].account_name,
          description: `Inventory from PO ${purchaseOrder.po_number}`,
          debit: totalAmount,
          credit: 0,
        },
        {
          account_id: accounts['2000'].id,
          account_code: accounts['2000'].account_code,
          account_name: accounts['2000'].account_name,
          description: `Payable to supplier for ${invoiceNumber}`,
          debit: 0,
          credit: totalAmount,
        },
      ],
    });

    await connection.commit();

    const apInvoiceId = invoiceResult.insertId;

    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'CREATE',
        moduleName: 'AP Invoices',
        recordId: apInvoiceId,
        description: `Created AP invoice ${invoiceNumber} for PO ${purchaseOrder.po_number}`,
        newValues: {
          ap_invoice_id: apInvoiceId,
          invoice_number: invoiceNumber,
          supplier_invoice_number,
          purchase_order_id: purchaseOrderId,
          supplier_id: purchaseOrder.supplier_id,
          invoice_date,
          due_date,
          total_amount: totalAmount,
          company_id,
          branch_id,
          business_unit_id,
        },
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('AP invoice audit log error:', auditError);
    }

    const invoice = await getApInvoiceWithItems(connection, apInvoiceId);

    res.status(201).json(invoice);
  } catch (error) {
    await connection.rollback();
    console.error('Create AP invoice error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        message: 'Supplier invoice number already exists',
      });
    }

    res.status(500).json({ message: error.message || 'Failed to create AP invoice' });
  } finally {
    connection.release();
  }
};

export const getApPayments = async (req, res) => {
  try {
    const { company_id, branch_id, business_unit_id } = requireDataScope(req);
    const { search = '', supplier_id = '', ap_invoice_id = '' } = req.query;

    let sql = `
      SELECT
        ap.*,
        ai.invoice_number,
        ai.supplier_invoice_number,
        ai.purchase_order_id,
        ai.supplier_id,
        po.po_number,
        s.name AS supplier_name
      FROM ap_payments ap
      INNER JOIN ap_invoices ai ON ap.ap_invoice_id = ai.id
      INNER JOIN purchase_orders po ON ai.purchase_order_id = po.id
      INNER JOIN suppliers s ON ai.supplier_id = s.id
      WHERE 1 = 1
    `;
    const values = [];

    sql += `
      AND ap.company_id = ?
      AND ap.branch_id = ?
      AND ap.business_unit_id = ?
    `;
    values.push(company_id, branch_id, business_unit_id);

    if (search) {
      sql += `
        AND (
          ap.payment_number LIKE ?
          OR ap.reference_number LIKE ?
          OR ai.invoice_number LIKE ?
          OR ai.supplier_invoice_number LIKE ?
          OR po.po_number LIKE ?
          OR s.name LIKE ?
        )
      `;
      values.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      );
    }

    if (supplier_id) {
      sql += ` AND ai.supplier_id = ?`;
      values.push(supplier_id);
    }

    if (ap_invoice_id) {
      sql += ` AND ap.ap_invoice_id = ?`;
      values.push(ap_invoice_id);
    }

    sql += ` ORDER BY ap.payment_date DESC, ap.id DESC`;

    const [rows] = await db.query(sql, values);
    res.json(rows);
  } catch (error) {
    console.error('Get AP payments error:', error);
    res.status(500).json({ message: 'Failed to fetch AP payments' });
  }
};

export const getPayableInvoices = async (req, res) => {
  try {
    const { company_id, branch_id, business_unit_id } = requireDataScope(req);

    const [rows] = await db.query(
      `
      SELECT
        ai.*,
        po.po_number,
        s.name AS supplier_name
      FROM ap_invoices ai
      INNER JOIN purchase_orders po ON ai.purchase_order_id = po.id
      INNER JOIN suppliers s ON ai.supplier_id = s.id
      WHERE ai.status IN ('Open', 'Partially Paid')
        AND ai.balance_amount > 0
        AND ai.company_id = ?
        AND ai.branch_id = ?
        AND ai.business_unit_id = ?
      ORDER BY ai.created_at DESC, ai.id DESC
      `,
      [company_id, branch_id, business_unit_id]
    );

    res.json(rows);
  } catch (error) {
    console.error('Get payable invoices error:', error);
    res.status(500).json({ message: 'Failed to fetch payable invoices' });
  }
};

export const postApPayment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { company_id, branch_id, business_unit_id } = requireDataScope(req);
    const paymentId = Number(req.params.id);

    await connection.beginTransaction();

    const [[payment]] = await connection.query(
      `
      SELECT *
      FROM ap_payments
      WHERE id = ?
      LIMIT 1
      `,
      [paymentId]
    );

    if (!payment) {
      await connection.rollback();
      return res.status(404).json({ message: 'AP payment not found' });
    }

    if (
      Number(payment.company_id || 0) !== Number(company_id || 0) ||
      Number(payment.branch_id || 0) !== Number(branch_id || 0) ||
      Number(payment.business_unit_id || 0) !== Number(business_unit_id || 0)
    ) {
      await connection.rollback();
      return res.status(403).json({ message: 'AP payment is outside your active scope' });
    }

    if (payment.status !== 'Draft') {
      await connection.rollback();
      return res.status(400).json({ message: 'Only draft payments can be posted' });
    }

    await ensurePostingDateIsOpen(connection, payment.payment_date, req);

    await connection.query(
      `
      UPDATE ap_payments
      SET
        status = 'Posted',
        posted_at = NOW(),
        posted_by = ?
      WHERE id = ?
      `,
      [req.user?.id || null, paymentId]
    );

    await connection.commit();

    res.json({ message: 'AP payment posted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Post AP payment error:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || 'Failed to post AP payment',
    });
  } finally {
    connection.release();
  }
};

export const createApPayment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { company_id, branch_id, business_unit_id } = requireDataScope(req);
    const {
      ap_invoice_id,
      payment_date,
      payment_method,
      reference_number,
      amount_paid,
      remarks,
    } = req.body;

    const invoiceId = Number(ap_invoice_id);
    const paymentAmount = Number(amount_paid);

    if (
      !invoiceId ||
      !payment_date ||
      !payment_method ||
      !paymentAmount ||
      paymentAmount <= 0
    ) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid AP payment data' });
    }

    const [[invoiceRow]] = await connection.query(
      `
      SELECT *
      FROM ap_invoices
      WHERE id = ?
      FOR UPDATE
      `,
      [invoiceId]
    );

    if (!invoiceRow) {
      await connection.rollback();
      return res.status(404).json({ message: 'AP invoice not found' });
    }

    if (
      Number(invoiceRow.company_id || 0) !== Number(company_id || 0) ||
      Number(invoiceRow.branch_id || 0) !== Number(branch_id || 0) ||
      Number(invoiceRow.business_unit_id || 0) !== Number(business_unit_id || 0)
    ) {
      await connection.rollback();
      return res.status(403).json({ message: 'AP invoice is outside your active scope' });
    }

    if (invoiceRow.status === 'Cancelled') {
      await connection.rollback();
      return res.status(400).json({ message: 'Cancelled invoice cannot be paid' });
    }

    if (invoiceRow.status === 'Paid' || Number(invoiceRow.balance_amount) <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invoice is already fully paid' });
    }

    const currentPaid = Number(invoiceRow.paid_amount || 0);
    const currentBalance = Number(invoiceRow.balance_amount || 0);

    if (paymentAmount > currentBalance) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Payment amount exceeds remaining invoice balance',
      });
    }

    const newPaidAmount = currentPaid + paymentAmount;
    const newBalanceAmount = Number(invoiceRow.total_amount || 0) - newPaidAmount;

    let newStatus = 'Open';
    if (newBalanceAmount <= 0) {
      newStatus = 'Paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'Partially Paid';
    }

    const paymentNumber = `PAY-${Date.now()}`;

    const [paymentResult] = await connection.query(
      `
      INSERT INTO ap_payments
      (
        payment_number,
        ap_invoice_id,
        payment_date,
        payment_method,
        reference_number,
        amount_paid,
        remarks,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        paymentNumber,
        invoiceId,
        payment_date,
        payment_method,
        reference_number || null,
        paymentAmount,
        remarks || null,
        company_id,
        branch_id,
        business_unit_id,
      ]
    );

    await connection.query(
      `
      UPDATE ap_invoices
      SET
        paid_amount = ?,
        balance_amount = ?,
        status = ?
      WHERE id = ?
      `,
      [newPaidAmount, newBalanceAmount, newStatus, invoiceId]
    );

    const accounts = await getAccountsByCodes(connection, ['1000', '2000']);

    if (!accounts['1000'] || !accounts['2000']) {
      throw new Error(
        'Required accounts not found. Please create Cash in Bank (1000) and Accounts Payable (2000).'
      );
    }

    await createJournalEntry(connection, {
      entry_date: payment_date,
      reference_type: 'AP Payment',
      reference_id: paymentResult.insertId,
      memo: `AP payment ${paymentNumber} for invoice ${invoiceRow.invoice_number}`,
      company_id,
      branch_id,
      business_unit_id,
      lines: [
        {
          account_id: accounts['2000'].id,
          account_code: accounts['2000'].account_code,
          account_name: accounts['2000'].account_name,
          description: `Settlement of AP ${invoiceRow.invoice_number}`,
          debit: paymentAmount,
          credit: 0,
        },
        {
          account_id: accounts['1000'].id,
          account_code: accounts['1000'].account_code,
          account_name: accounts['1000'].account_name,
          description: `Cash disbursement for ${paymentNumber}`,
          debit: 0,
          credit: paymentAmount,
        },
      ],
    });

    await connection.commit();

    const paymentId = paymentResult.insertId;

    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'CREATE',
        moduleName: 'AP Payments',
        recordId: paymentId,
        description: `Created AP payment ${paymentNumber} for invoice ${invoiceRow.invoice_number}`,
        newValues: {
          ap_payment_id: paymentId,
          payment_number: paymentNumber,
          ap_invoice_id: invoiceId,
          payment_date,
          payment_method,
          reference_number: reference_number || null,
          amount_paid: paymentAmount,
          remarks: remarks || null,
          previous_paid_amount: currentPaid,
          new_paid_amount: newPaidAmount,
          previous_balance_amount: currentBalance,
          new_balance_amount: newBalanceAmount,
          invoice_status: newStatus,
          company_id,
          branch_id,
          business_unit_id,
        },
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('AP payment audit log error:', auditError);
    }

    const [rows] = await connection.query(
      `
      SELECT
        ap.*,
        ai.invoice_number,
        ai.supplier_invoice_number,
        ai.purchase_order_id,
        ai.supplier_id,
        po.po_number,
        s.name AS supplier_name
      FROM ap_payments ap
      INNER JOIN ap_invoices ai ON ap.ap_invoice_id = ai.id
      INNER JOIN purchase_orders po ON ai.purchase_order_id = po.id
      INNER JOIN suppliers s ON ai.supplier_id = s.id
      WHERE ap.id = ?
      `,
      [paymentId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Create AP payment error:', error);
    res.status(500).json({ message: error.message || 'Failed to save AP payment' });
  } finally {
    connection.release();
  }
};
