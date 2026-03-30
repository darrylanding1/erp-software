import db from '../config/db.js';
import { decreaseWarehouseStock } from '../utils/inventoryStock.js';

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const getNextNumber = async (prefix, table, column) => {
  const [rows] = await db.query(
    `
    SELECT ${column} AS document_number
    FROM ${table}
    ORDER BY id DESC
    LIMIT 1
    `
  );

  if (!rows.length || !rows[0].document_number) {
    return `${prefix}-00001`;
  }

  const currentNumber = rows[0].document_number;
  const numericPart = Number(String(currentNumber).split('-').pop() || 0) + 1;
  return `${prefix}-${String(numericPart).padStart(5, '0')}`;
};

const getAccountByCode = async (accountCode) => {
  const [rows] = await db.query(
    `
    SELECT id, account_code, account_name, account_type
    FROM chart_of_accounts
    WHERE account_code = ?
    LIMIT 1
    `,
    [accountCode]
  );

  return rows[0] || null;
};

export const getDeliveryCandidates = async (req, res) => {
  try {
    const { customer_id = '', warehouse_id = '' } = req.query;

    let sql = `
      SELECT
        si.id,
        si.invoice_number,
        si.customer_id,
        c.name AS customer_name,
        si.invoice_date,
        si.due_date,
        si.status,
        si.total_amount
      FROM sales_invoices si
      INNER JOIN customers c
        ON c.id = si.customer_id
      WHERE si.status IN ('Posted', 'Paid')
    `;
    const values = [];

    if (customer_id) {
      sql += ` AND si.customer_id = ?`;
      values.push(Number(customer_id));
    }

    sql += ` ORDER BY si.invoice_date DESC, si.id DESC`;

    const [invoiceRows] = await db.query(sql, values);

    if (!invoiceRows.length) {
      return res.json([]);
    }

    const invoiceIds = invoiceRows.map((row) => row.id);

    const [itemRows] = await db.query(
      `
      SELECT
        sii.id,
        sii.sales_invoice_id,
        sii.product_id,
        p.sku,
        p.name AS product_name,
        sii.quantity AS invoice_quantity,
        sii.unit_price,
        sii.line_total,
        COALESCE((
          SELECT SUM(sdi.delivered_quantity)
          FROM sales_delivery_items sdi
          INNER JOIN sales_deliveries sd
            ON sd.id = sdi.sales_delivery_id
          WHERE sdi.sales_invoice_item_id = sii.id
            AND sd.status = 'Posted'
        ), 0) AS delivered_quantity
      FROM sales_invoice_items sii
      INNER JOIN products p
        ON p.id = sii.product_id
      WHERE sii.sales_invoice_id IN (?)
      ORDER BY sii.sales_invoice_id DESC, sii.id ASC
      `,
      [invoiceIds]
    );

    const warehouseId = Number(warehouse_id) || null;

    let stockMap = new Map();

    if (warehouseId) {
      const productIds = [...new Set(itemRows.map((item) => item.product_id))];

      if (productIds.length) {
        const [stockRows] = await db.query(
          `
          SELECT
            product_id,
            warehouse_id,
            quantity,
            unit_cost,
            total_value
          FROM inventory_stocks
          WHERE warehouse_id = ?
            AND product_id IN (?)
          `,
          [warehouseId, productIds]
        );

        stockMap = new Map(
          stockRows.map((row) => [`${row.product_id}-${row.warehouse_id}`, row])
        );
      }
    }

    const itemMap = new Map();

    for (const item of itemRows) {
      const remainingQuantity = Number(item.invoice_quantity) - Number(item.delivered_quantity);

      if (remainingQuantity <= 0) continue;

      const stockKey = warehouseId ? `${item.product_id}-${warehouseId}` : null;
      const stockRow = stockKey ? stockMap.get(stockKey) : null;

      const availableQuantity = stockRow ? Number(stockRow.quantity || 0) : null;
      const unitCost = stockRow ? Number(stockRow.unit_cost || 0) : 0;

      const prepared = {
        ...item,
        delivered_quantity: Number(item.delivered_quantity || 0),
        remaining_quantity: remainingQuantity,
        available_quantity: availableQuantity,
        unit_cost: unitCost,
      };

      if (!itemMap.has(item.sales_invoice_id)) {
        itemMap.set(item.sales_invoice_id, []);
      }

      itemMap.get(item.sales_invoice_id).push(prepared);
    }

    const result = invoiceRows
      .map((invoice) => ({
        ...invoice,
        items: itemMap.get(invoice.id) || [],
      }))
      .filter((invoice) => invoice.items.length > 0);

    res.json(result);
  } catch (error) {
    console.error('Get delivery candidates error:', error);
    res.status(500).json({ message: 'Failed to fetch delivery candidates' });
  }
};

export const getSalesDeliveries = async (req, res) => {
  try {
    const {
      sales_invoice_id = '',
      warehouse_id = '',
      date_from = '',
      date_to = '',
      search = '',
    } = req.query;

    let sql = `
      SELECT
        sd.id,
        sd.delivery_number,
        sd.sales_invoice_id,
        sd.warehouse_id,
        sd.delivery_date,
        sd.status,
        sd.remarks,
        sd.total_quantity,
        sd.total_cost,
        si.invoice_number,
        si.customer_id,
        c.name AS customer_name,
        w.name AS warehouse_name,
        w.code AS warehouse_code
      FROM sales_deliveries sd
      INNER JOIN sales_invoices si
        ON si.id = sd.sales_invoice_id
      INNER JOIN customers c
        ON c.id = si.customer_id
      INNER JOIN warehouses w
        ON w.id = sd.warehouse_id
      WHERE 1 = 1
    `;
    const values = [];

    if (sales_invoice_id) {
      sql += ` AND sd.sales_invoice_id = ?`;
      values.push(Number(sales_invoice_id));
    }

    if (warehouse_id) {
      sql += ` AND sd.warehouse_id = ?`;
      values.push(Number(warehouse_id));
    }

    if (date_from) {
      sql += ` AND sd.delivery_date >= ?`;
      values.push(date_from);
    }

    if (date_to) {
      sql += ` AND sd.delivery_date <= ?`;
      values.push(date_to);
    }

    if (search) {
      sql += ` AND (sd.delivery_number LIKE ? OR si.invoice_number LIKE ? OR c.name LIKE ?)`;
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY sd.delivery_date DESC, sd.id DESC`;

    const [deliveryRows] = await db.query(sql, values);

    if (!deliveryRows.length) {
      return res.json([]);
    }

    const deliveryIds = deliveryRows.map((row) => row.id);

    const [itemRows] = await db.query(
      `
      SELECT
        sdi.id,
        sdi.sales_delivery_id,
        sdi.sales_invoice_item_id,
        sdi.product_id,
        p.sku,
        p.name AS product_name,
        sdi.delivered_quantity,
        sdi.unit_cost,
        sdi.line_cost
      FROM sales_delivery_items sdi
      INNER JOIN products p
        ON p.id = sdi.product_id
      WHERE sdi.sales_delivery_id IN (?)
      ORDER BY sdi.sales_delivery_id DESC, sdi.id ASC
      `,
      [deliveryIds]
    );

    const itemMap = new Map();

    for (const item of itemRows) {
      if (!itemMap.has(item.sales_delivery_id)) {
        itemMap.set(item.sales_delivery_id, []);
      }
      itemMap.get(item.sales_delivery_id).push(item);
    }

    const result = deliveryRows.map((delivery) => ({
      ...delivery,
      items: itemMap.get(delivery.id) || [],
    }));

    res.json(result);
  } catch (error) {
    console.error('Get sales deliveries error:', error);
    res.status(500).json({ message: 'Failed to fetch sales deliveries' });
  }
};

export const getDeliveryDashboardSummary = async (req, res) => {
  try {
    const [[summary]] = await db.query(
      `
      SELECT
        COALESCE((
          SELECT SUM(quantity)
          FROM sales_invoice_items
        ), 0) AS billed_quantity,
        COALESCE((
          SELECT SUM(sdi.delivered_quantity)
          FROM sales_delivery_items sdi
          INNER JOIN sales_deliveries sd
            ON sd.id = sdi.sales_delivery_id
          WHERE sd.status = 'Posted'
        ), 0) AS delivered_quantity,
        COALESCE((
          SELECT SUM(sri.returned_quantity)
          FROM sales_return_items sri
          INNER JOIN sales_returns sr
            ON sr.id = sri.sales_return_id
          WHERE sr.status = 'Posted'
        ), 0) AS returned_quantity,
        COALESCE((
          SELECT COUNT(*)
          FROM sales_invoices
          WHERE delivery_status = 'Not Delivered'
        ), 0) AS not_delivered_count,
        COALESCE((
          SELECT COUNT(*)
          FROM sales_invoices
          WHERE delivery_status = 'Partial Delivered'
        ), 0) AS partial_delivered_count,
        COALESCE((
          SELECT COUNT(*)
          FROM sales_invoices
          WHERE delivery_status = 'Fully Delivered'
        ), 0) AS fully_delivered_count
      `
    );

    res.json({
      billed_quantity: Number(summary.billed_quantity || 0),
      delivered_quantity: Number(summary.delivered_quantity || 0),
      returned_quantity: Number(summary.returned_quantity || 0),
      open_delivery_quantity:
        Number(summary.billed_quantity || 0) - Number(summary.delivered_quantity || 0),
      not_delivered_count: Number(summary.not_delivered_count || 0),
      partial_delivered_count: Number(summary.partial_delivered_count || 0),
      fully_delivered_count: Number(summary.fully_delivered_count || 0),
    });
  } catch (error) {
    console.error('Get delivery dashboard summary error:', error);
    res.status(500).json({ message: 'Failed to fetch delivery dashboard summary' });
  }
};

export const createSalesDelivery = async (req, res) => {
  const connection = await db.getConnection();

  const updateSalesInvoiceDeliveryStatus = async (connection, salesInvoiceId) => {
    const [[invoiceQtyRow]] = await connection.query(
      `
      SELECT COALESCE(SUM(quantity), 0) AS invoice_qty
      FROM sales_invoice_items
      WHERE sales_invoice_id = ?
      `,
      [salesInvoiceId]
    );

    const [[deliveredQtyRow]] = await connection.query(
      `
      SELECT COALESCE(SUM(sdi.delivered_quantity), 0) AS delivered_qty
      FROM sales_delivery_items sdi
      INNER JOIN sales_deliveries sd
        ON sd.id = sdi.sales_delivery_id
      WHERE sd.sales_invoice_id = ?
        AND sd.status = 'Posted'
      `,
      [salesInvoiceId]
    );

    const invoiceQty = Number(invoiceQtyRow?.invoice_qty || 0);
    const deliveredQty = Number(deliveredQtyRow?.delivered_qty || 0);

    let deliveryStatus = 'Not Delivered';

    if (deliveredQty <= 0) {
      deliveryStatus = 'Not Delivered';
    } else if (deliveredQty < invoiceQty) {
      deliveryStatus = 'Partial Delivered';
    } else {
      deliveryStatus = 'Fully Delivered';
    }

    await connection.query(
      `
      UPDATE sales_invoices
      SET delivery_status = ?
      WHERE id = ?
      `,
      [deliveryStatus, salesInvoiceId]
    );
  };

  try {
    await connection.beginTransaction();

    const {
      sales_invoice_id,
      warehouse_id,
      delivery_date,
      remarks = '',
      items = [],
    } = req.body;

    const salesInvoiceId = Number(sales_invoice_id);
    const warehouseId = Number(warehouse_id);

    if (!salesInvoiceId || !warehouseId || !delivery_date || !Array.isArray(items) || !items.length) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Sales invoice, warehouse, delivery date, and at least one item are required',
      });
    }

    const [[invoice]] = await connection.query(
      `
      SELECT
        si.id,
        si.invoice_number,
        si.customer_id,
        si.status
      FROM sales_invoices si
      WHERE si.id = ?
      LIMIT 1
      `,
      [salesInvoiceId]
    );

    if (!invoice) {
      await connection.rollback();
      return res.status(404).json({ message: 'Sales invoice not found' });
    }

    if (!['Posted', 'Paid'].includes(invoice.status)) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Only posted or paid sales invoices can be delivered',
      });
    }

    const [[warehouse]] = await connection.query(
      `
      SELECT id, name, code, status
      FROM warehouses
      WHERE id = ?
      LIMIT 1
      `,
      [warehouseId]
    );

    if (!warehouse) {
      await connection.rollback();
      return res.status(404).json({ message: 'Warehouse not found' });
    }

    if (warehouse.status !== 'Active') {
      await connection.rollback();
      return res.status(400).json({ message: 'Warehouse is inactive' });
    }

    const cogsAccount = await getAccountByCode('5000');
    const inventoryAccount = await getAccountByCode('1200');

    if (!cogsAccount || !inventoryAccount) {
      await connection.rollback();
      return res.status(400).json({
        message:
          'Required accounts are missing. Please ensure 5000 Cost of Goods Sold and 1200 Inventory Asset exist.',
      });
    }

    let totalQuantity = 0;
    let totalCost = 0;
    const preparedItems = [];

    for (const rawItem of items) {
      const salesInvoiceItemId = Number(rawItem.sales_invoice_item_id);
      const deliverQty = Number(rawItem.delivered_quantity);

      if (!salesInvoiceItemId || deliverQty <= 0) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Each delivery item must have a valid invoice item and quantity',
        });
      }

      const [[invoiceItem]] = await connection.query(
        `
        SELECT
          sii.id,
          sii.sales_invoice_id,
          sii.product_id,
          sii.quantity AS invoice_quantity,
          p.name AS product_name,
          p.sku
        FROM sales_invoice_items sii
        INNER JOIN products p
          ON p.id = sii.product_id
        WHERE sii.id = ?
          AND sii.sales_invoice_id = ?
        LIMIT 1
        `,
        [salesInvoiceItemId, salesInvoiceId]
      );

      if (!invoiceItem) {
        await connection.rollback();
        return res.status(404).json({
          message: `Sales invoice item not found: ${salesInvoiceItemId}`,
        });
      }

      const [[deliveredRow]] = await connection.query(
        `
        SELECT COALESCE(SUM(sdi.delivered_quantity), 0) AS delivered_quantity
        FROM sales_delivery_items sdi
        INNER JOIN sales_deliveries sd
          ON sd.id = sdi.sales_delivery_id
        WHERE sdi.sales_invoice_item_id = ?
          AND sd.status = 'Posted'
        `,
        [salesInvoiceItemId]
      );

      const alreadyDelivered = Number(deliveredRow?.delivered_quantity || 0);
      const remainingQuantity = Number(invoiceItem.invoice_quantity) - alreadyDelivered;

      if (deliverQty > remainingQuantity) {
        await connection.rollback();
        return res.status(400).json({
          message: `${invoiceItem.sku} exceeds remaining quantity. Remaining: ${remainingQuantity}`,
        });
      }

      const [[stockRow]] = await connection.query(
        `
        SELECT
          id,
          quantity,
          unit_cost,
          total_value
        FROM inventory_stocks
        WHERE product_id = ?
          AND warehouse_id = ?
        LIMIT 1
        `,
        [invoiceItem.product_id, warehouseId]
      );

      if (!stockRow) {
        await connection.rollback();
        return res.status(400).json({
          message: `No warehouse stock found for ${invoiceItem.sku} in ${warehouse.code}`,
        });
      }

      const availableQty = Number(stockRow.quantity || 0);

      if (deliverQty > availableQty) {
        await connection.rollback();
        return res.status(400).json({
          message: `${invoiceItem.sku} has insufficient stock in ${warehouse.code}. Available: ${availableQty}`,
        });
      }

      preparedItems.push({
        sales_invoice_item_id: salesInvoiceItemId,
        product_id: invoiceItem.product_id,
        sku: invoiceItem.sku,
        product_name: invoiceItem.product_name,
        delivered_quantity: deliverQty,
        previous_quantity: 0,
        new_quantity: 0,
        unit_cost: 0,
        line_cost: 0,
      });

      totalQuantity += deliverQty;
    }

    const deliveryNumber = await getNextNumber(
      'DN',
      'sales_deliveries',
      'delivery_number'
    );

    const [deliveryResult] = await connection.query(
      `
      INSERT INTO sales_deliveries
      (
        delivery_number,
        sales_invoice_id,
        warehouse_id,
        delivery_date,
        status,
        remarks,
        total_quantity,
        total_cost
      )
      VALUES (?, ?, ?, ?, 'Posted', ?, ?, ?)
      `,
      [
        deliveryNumber,
        salesInvoiceId,
        warehouseId,
        delivery_date,
        remarks?.trim() || null,
        totalQuantity,
        0,
      ]
    );

    const salesDeliveryId = deliveryResult.insertId;

    for (const item of preparedItems) {
      const stockChange = await decreaseWarehouseStock(connection, {
        productId: item.product_id,
        warehouseId,
        quantity: item.delivered_quantity,
      });

      item.previous_quantity = stockChange.previousQuantity;
      item.new_quantity = stockChange.newQuantity;
      item.unit_cost = round2(stockChange.unitCost);
      item.line_cost = round2(item.delivered_quantity * stockChange.unitCost);

      totalCost = round2(totalCost + item.line_cost);

      await connection.query(
        `
        INSERT INTO sales_delivery_items
        (
          sales_delivery_id,
          sales_invoice_item_id,
          product_id,
          delivered_quantity,
          unit_cost,
          line_cost
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          salesDeliveryId,
          item.sales_invoice_item_id,
          item.product_id,
          item.delivered_quantity,
          item.unit_cost,
          item.line_cost,
        ]
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
          reference_number
        )
        VALUES (?, ?, 'Stock Out', 'Sales Delivery', ?, ?, ?, ?, ?, ?)
        `,
        [
          item.product_id,
          warehouseId,
          salesDeliveryId,
          item.delivered_quantity,
          item.previous_quantity,
          item.new_quantity,
          `Delivery ${deliveryNumber} for invoice ${invoice.invoice_number}`,
          deliveryNumber,
        ]
      );
    }

    await connection.query(
      `
      UPDATE sales_deliveries
      SET total_cost = ?
      WHERE id = ?
      `,
      [totalCost, salesDeliveryId]
    );

    const entryNumber = await getNextNumber('JE', 'journal_entries', 'entry_number');

    const [entryResult] = await connection.query(
      `
      INSERT INTO journal_entries
      (
        entry_number,
        entry_date,
        reference_type,
        reference_id,
        memo,
        total_debit,
        total_credit,
        status
      )
      VALUES (?, ?, 'Sales Delivery', ?, ?, ?, ?, 'Posted')
      `,
      [
        entryNumber,
        delivery_date,
        salesDeliveryId,
        `COGS posting for ${deliveryNumber}`,
        totalCost,
        totalCost,
      ]
    );

    const journalEntryId = entryResult.insertId;

    await connection.query(
      `
      INSERT INTO journal_entry_lines
      (
        journal_entry_id,
        account_id,
        account_code,
        account_name,
        description,
        debit,
        credit
      )
      VALUES
      (?, ?, ?, ?, ?, ?, 0),
      (?, ?, ?, ?, ?, 0, ?)
      `,
      [
        journalEntryId,
        cogsAccount.id,
        cogsAccount.account_code,
        cogsAccount.account_name,
        `COGS for ${deliveryNumber}`,
        totalCost,

        journalEntryId,
        inventoryAccount.id,
        inventoryAccount.account_code,
        inventoryAccount.account_name,
        `Inventory reduction for ${deliveryNumber}`,
        totalCost,
      ]
    );

    await updateSalesInvoiceDeliveryStatus(connection, salesInvoiceId);
    await connection.commit();

    const [rows] = await connection.query(
      `
      SELECT
        sd.*,
        si.invoice_number,
        c.name AS customer_name,
        w.name AS warehouse_name,
        w.code AS warehouse_code
      FROM sales_deliveries sd
      INNER JOIN sales_invoices si
        ON si.id = sd.sales_invoice_id
      INNER JOIN customers c
        ON c.id = si.customer_id
      INNER JOIN warehouses w
        ON w.id = sd.warehouse_id
      WHERE sd.id = ?
      `,
      [salesDeliveryId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Create sales delivery error:', error);
    res.status(500).json({ message: 'Failed to create sales delivery' });
  } finally {
    connection.release();
  }
};