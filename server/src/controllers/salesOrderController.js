import db from '../config/db.js';
import { createAuditLog, getRequestIp } from '../utils/auditTrail.js';

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

const getSalesOrderInvoiceStatus = async (connection, salesOrderId) => {
  const [[qtyRow]] = await connection.query(
    `
    SELECT
      COALESCE(SUM(quantity), 0) AS ordered_qty,
      COALESCE(SUM(invoiced_quantity), 0) AS invoiced_qty
    FROM sales_order_items
    WHERE sales_order_id = ?
    `,
    [salesOrderId]
  );

  const orderedQty = Number(qtyRow?.ordered_qty || 0);
  const invoicedQty = Number(qtyRow?.invoiced_qty || 0);

  if (orderedQty <= 0) return 'Draft';
  if (invoicedQty <= 0) return 'Approved';
  if (invoicedQty < orderedQty) return 'Partially Invoiced';
  return 'Fully Invoiced';
};

export const getSalesOrderMeta = async (_req, res) => {
  try {
    const [customers] = await db.query(
      `
      SELECT id, customer_code, name, status
      FROM customers
      WHERE status = 'Active'
      ORDER BY name ASC
      `
    );

    const [warehouses] = await db.query(
      `
      SELECT id, name, code, address, status
      FROM warehouses
      WHERE status = 'Active'
      ORDER BY name ASC
      `
    );

    const [products] = await db.query(
      `
      SELECT
        p.id,
        p.name,
        p.sku,
        p.base_price,
        p.market_price,
        p.status
      FROM products p
      ORDER BY p.name ASC
      `
    );

    res.json({
      customers,
      warehouses,
      products,
    });
  } catch (error) {
    console.error('Get sales order meta error:', error);
    res.status(500).json({ message: 'Failed to fetch sales order meta' });
  }
};

export const getSalesOrders = async (req, res) => {
  try {
    const {
      customer_id = '',
      warehouse_id = '',
      status = '',
      date_from = '',
      date_to = '',
      search = '',
    } = req.query;

    let sql = `
      SELECT
        so.id,
        so.so_number,
        so.customer_id,
        so.warehouse_id,
        so.order_date,
        so.due_date,
        so.status,
        so.remarks,
        so.total_amount,
        so.created_by,
        so.approved_by,
        so.approved_at,
        so.created_at,
        so.updated_at,
        c.customer_code,
        c.name AS customer_name,
        w.name AS warehouse_name,
        w.code AS warehouse_code,
        creator.full_name AS created_by_name,
        approver.full_name AS approved_by_name,
        COALESCE(agg.item_count, 0) AS item_count,
        COALESCE(agg.total_quantity, 0) AS total_quantity,
        COALESCE(agg.total_invoiced_quantity, 0) AS total_invoiced_quantity
      FROM sales_orders so
      INNER JOIN customers c
        ON c.id = so.customer_id
      INNER JOIN warehouses w
        ON w.id = so.warehouse_id
      LEFT JOIN users creator
        ON creator.id = so.created_by
      LEFT JOIN users approver
        ON approver.id = so.approved_by
      LEFT JOIN (
        SELECT
          sales_order_id,
          COUNT(*) AS item_count,
          COALESCE(SUM(quantity), 0) AS total_quantity,
          COALESCE(SUM(invoiced_quantity), 0) AS total_invoiced_quantity
        FROM sales_order_items
        GROUP BY sales_order_id
      ) agg
        ON agg.sales_order_id = so.id
      WHERE 1 = 1
    `;
    const values = [];

    if (customer_id) {
      sql += ` AND so.customer_id = ?`;
      values.push(Number(customer_id));
    }

    if (warehouse_id) {
      sql += ` AND so.warehouse_id = ?`;
      values.push(Number(warehouse_id));
    }

    if (status) {
      sql += ` AND so.status = ?`;
      values.push(status);
    }

    if (date_from) {
      sql += ` AND so.order_date >= ?`;
      values.push(date_from);
    }

    if (date_to) {
      sql += ` AND so.order_date <= ?`;
      values.push(date_to);
    }

    if (search) {
      sql += `
        AND (
          so.so_number LIKE ?
          OR c.customer_code LIKE ?
          OR c.name LIKE ?
          OR w.name LIKE ?
          OR w.code LIKE ?
        )
      `;
      values.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      );
    }

    sql += ` ORDER BY so.id DESC`;

    const [orders] = await db.query(sql, values);

    if (!orders.length) {
      return res.json([]);
    }

    const orderIds = orders.map((row) => row.id);

    const [items] = await db.query(
      `
      SELECT
        soi.id,
        soi.sales_order_id,
        soi.product_id,
        soi.quantity,
        soi.invoiced_quantity,
        (soi.quantity - soi.invoiced_quantity) AS remaining_quantity,
        soi.unit_price,
        soi.line_total,
        soi.created_at,
        soi.updated_at,
        p.name AS product_name,
        p.sku
      FROM sales_order_items soi
      INNER JOIN products p
        ON p.id = soi.product_id
      WHERE soi.sales_order_id IN (?)
      ORDER BY soi.id ASC
      `,
      [orderIds]
    );

    const itemsByOrderId = items.reduce((acc, item) => {
      if (!acc[item.sales_order_id]) acc[item.sales_order_id] = [];
      acc[item.sales_order_id].push(item);
      return acc;
    }, {});

    const response = orders.map((order) => ({
      ...order,
      items: itemsByOrderId[order.id] || [],
    }));

    res.json(response);
  } catch (error) {
    console.error('Get sales orders error:', error);
    res.status(500).json({ message: 'Failed to fetch sales orders' });
  }
};

export const createSalesOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      customer_id,
      warehouse_id,
      order_date,
      due_date = null,
      remarks = '',
      items = [],
    } = req.body;

    if (!customer_id) {
      return res.status(400).json({ message: 'Customer is required' });
    }

    if (!warehouse_id) {
      return res.status(400).json({ message: 'Warehouse is required' });
    }

    if (!order_date) {
      return res.status(400).json({ message: 'Order date is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one sales order item is required' });
    }

    for (const item of items) {
      if (!item.product_id) {
        return res.status(400).json({ message: 'Each item must have a product' });
      }

      if (Number(item.quantity) <= 0) {
        return res.status(400).json({ message: 'Each item quantity must be greater than zero' });
      }

      if (Number(item.unit_price) < 0) {
        return res.status(400).json({ message: 'Unit price cannot be negative' });
      }
    }

    await connection.beginTransaction();

    const [[customerRow]] = await connection.query(
      `
      SELECT id, name, status
      FROM customers
      WHERE id = ?
      FOR UPDATE
      `,
      [Number(customer_id)]
    );

    if (!customerRow || customerRow.status !== 'Active') {
      await connection.rollback();
      return res.status(400).json({ message: 'Selected customer is invalid or inactive' });
    }

    const [[warehouseRow]] = await connection.query(
      `
      SELECT id, name, code, status
      FROM warehouses
      WHERE id = ?
      FOR UPDATE
      `,
      [Number(warehouse_id)]
    );

    if (!warehouseRow || warehouseRow.status !== 'Active') {
      await connection.rollback();
      return res.status(400).json({ message: 'Selected warehouse is invalid or inactive' });
    }

    const soNumber = await getNextNumber('SO', 'sales_orders', 'so_number');

    let totalAmount = 0;

    const normalizedItems = items.map((item) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = round2(item.unit_price || 0);
      const lineTotal = round2(quantity * unitPrice);
      totalAmount += lineTotal;

      return {
        product_id: Number(item.product_id),
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
      };
    });

    const [orderResult] = await connection.query(
      `
      INSERT INTO sales_orders
      (
        so_number,
        customer_id,
        warehouse_id,
        order_date,
        due_date,
        status,
        remarks,
        total_amount,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, 'Draft', ?, ?, ?)
      `,
      [
        soNumber,
        Number(customer_id),
        Number(warehouse_id),
        order_date,
        due_date || null,
        remarks?.trim() || null,
        round2(totalAmount),
        req.user?.id || null,
      ]
    );

    const salesOrderId = orderResult.insertId;

    for (const item of normalizedItems) {
      await connection.query(
        `
        INSERT INTO sales_order_items
        (
          sales_order_id,
          product_id,
          quantity,
          invoiced_quantity,
          unit_price,
          line_total
        )
        VALUES (?, ?, ?, 0, ?, ?)
        `,
        [
          salesOrderId,
          item.product_id,
          item.quantity,
          item.unit_price,
          item.line_total,
        ]
      );
    }

    await connection.commit();

    const [[createdOrder]] = await db.query(
      `
      SELECT
        so.*,
        c.customer_code,
        c.name AS customer_name,
        w.name AS warehouse_name,
        w.code AS warehouse_code
      FROM sales_orders so
      INNER JOIN customers c
        ON c.id = so.customer_id
      INNER JOIN warehouses w
        ON w.id = so.warehouse_id
      WHERE so.id = ?
      `,
      [salesOrderId]
    );

    const [createdItems] = await db.query(
      `
      SELECT
        soi.*,
        p.name AS product_name,
        p.sku
      FROM sales_order_items soi
      INNER JOIN products p
        ON p.id = soi.product_id
      WHERE soi.sales_order_id = ?
      ORDER BY soi.id ASC
      `,
      [salesOrderId]
    );

    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'CREATE',
        moduleName: 'Sales Orders',
        recordId: salesOrderId,
        description: `Created sales order ${soNumber}`,
        newValues: { ...createdOrder, items: createdItems },
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('Create sales order audit log error:', auditError);
    }

    res.status(201).json({
      ...createdOrder,
      items: createdItems,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create sales order error:', error);
    res.status(500).json({ message: 'Failed to create sales order' });
  } finally {
    connection.release();
  }
};

export const approveSalesOrder = async (req, res) => {
  try {
    const salesOrderId = Number(req.params.id);

    if (!salesOrderId) {
      return res.status(400).json({ message: 'Invalid sales order id' });
    }

    const [existingRows] = await db.query(
      `
      SELECT *
      FROM sales_orders
      WHERE id = ?
      `,
      [salesOrderId]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: 'Sales order not found' });
    }

    const existingOrder = existingRows[0];

    if (existingOrder.status === 'Cancelled') {
      return res.status(400).json({ message: 'Cancelled sales order cannot be approved' });
    }

    if (existingOrder.status !== 'Draft') {
      return res.status(400).json({ message: 'Only Draft sales orders can be approved' });
    }

    await db.query(
      `
      UPDATE sales_orders
      SET
        status = 'Approved',
        approved_by = ?,
        approved_at = NOW()
      WHERE id = ?
      `,
      [req.user?.id || null, salesOrderId]
    );

    const [[updatedOrder]] = await db.query(
      `
      SELECT *
      FROM sales_orders
      WHERE id = ?
      `,
      [salesOrderId]
    );

    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'APPROVE',
        moduleName: 'Sales Orders',
        recordId: salesOrderId,
        description: `Approved sales order ${existingOrder.so_number}`,
        oldValues: existingOrder,
        newValues: updatedOrder,
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('Approve sales order audit log error:', auditError);
    }

    res.json({
      message: 'Sales order approved successfully',
      salesOrder: updatedOrder,
    });
  } catch (error) {
    console.error('Approve sales order error:', error);
    res.status(500).json({ message: 'Failed to approve sales order' });
  }
};

export const cancelSalesOrder = async (req, res) => {
  try {
    const salesOrderId = Number(req.params.id);

    if (!salesOrderId) {
      return res.status(400).json({ message: 'Invalid sales order id' });
    }

    const [existingRows] = await db.query(
      `
      SELECT *
      FROM sales_orders
      WHERE id = ?
      `,
      [salesOrderId]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: 'Sales order not found' });
    }

    const existingOrder = existingRows[0];

    if (existingOrder.status === 'Cancelled') {
      return res.status(400).json({ message: 'Sales order is already cancelled' });
    }

    if (existingOrder.status === 'Fully Invoiced') {
      return res.status(400).json({ message: 'Fully invoiced sales order cannot be cancelled' });
    }

    await db.query(
      `
      UPDATE sales_orders
      SET status = 'Cancelled'
      WHERE id = ?
      `,
      [salesOrderId]
    );

    const [[updatedOrder]] = await db.query(
      `
      SELECT *
      FROM sales_orders
      WHERE id = ?
      `,
      [salesOrderId]
    );

    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'CANCEL',
        moduleName: 'Sales Orders',
        recordId: salesOrderId,
        description: `Cancelled sales order ${existingOrder.so_number}`,
        oldValues: existingOrder,
        newValues: updatedOrder,
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('Cancel sales order audit log error:', auditError);
    }

    res.json({
      message: 'Sales order cancelled successfully',
      salesOrder: updatedOrder,
    });
  } catch (error) {
    console.error('Cancel sales order error:', error);
    res.status(500).json({ message: 'Failed to cancel sales order' });
  }
};

export const createInvoiceFromSalesOrder = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const salesOrderId = Number(req.params.id);
    const {
      invoice_date,
      due_date = null,
      remarks = '',
      items = [],
    } = req.body;

    if (!salesOrderId) {
      return res.status(400).json({ message: 'Invalid sales order id' });
    }

    if (!invoice_date) {
      return res.status(400).json({ message: 'Invoice date is required' });
    }

    await connection.beginTransaction();

    const [[salesOrder]] = await connection.query(
      `
      SELECT *
      FROM sales_orders
      WHERE id = ?
      FOR UPDATE
      `,
      [salesOrderId]
    );

    if (!salesOrder) {
      await connection.rollback();
      return res.status(404).json({ message: 'Sales order not found' });
    }

    if (!['Approved', 'Partially Invoiced'].includes(salesOrder.status)) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Only Approved or Partially Invoiced sales orders can be invoiced',
      });
    }

    const [orderItems] = await connection.query(
      `
      SELECT
        soi.*,
        p.name AS product_name,
        p.sku
      FROM sales_order_items soi
      INNER JOIN products p
        ON p.id = soi.product_id
      WHERE soi.sales_order_id = ?
      ORDER BY soi.id ASC
      FOR UPDATE
      `,
      [salesOrderId]
    );

    if (!orderItems.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Sales order has no items' });
    }

    const itemMap = orderItems.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    let requestedItems = [];

    if (Array.isArray(items) && items.length > 0) {
      requestedItems = items.map((item) => ({
        sales_order_item_id: Number(item.sales_order_item_id),
        quantity: Number(item.quantity || 0),
      }));
    } else {
      requestedItems = orderItems.map((item) => ({
        sales_order_item_id: item.id,
        quantity: Number(item.quantity || 0) - Number(item.invoiced_quantity || 0),
      }));
    }

    const normalizedInvoiceItems = [];
    let invoiceTotal = 0;

    for (const requested of requestedItems) {
      const orderItem = itemMap[requested.sales_order_item_id];

      if (!orderItem) {
        await connection.rollback();
        return res.status(400).json({ message: 'One or more sales order items are invalid' });
      }

      const orderedQty = Number(orderItem.quantity || 0);
      const alreadyInvoiced = Number(orderItem.invoiced_quantity || 0);
      const remainingQty = orderedQty - alreadyInvoiced;
      const qtyToInvoice = Number(requested.quantity || 0);

      if (qtyToInvoice <= 0) {
        continue;
      }

      if (qtyToInvoice > remainingQty) {
        await connection.rollback();
        return res.status(400).json({
          message: `Invoice quantity for ${orderItem.product_name} exceeds remaining quantity`,
        });
      }

      const unitPrice = round2(orderItem.unit_price);
      const lineTotal = round2(qtyToInvoice * unitPrice);
      invoiceTotal += lineTotal;

      normalizedInvoiceItems.push({
        sales_order_item_id: orderItem.id,
        product_id: orderItem.product_id,
        quantity: qtyToInvoice,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    if (!normalizedInvoiceItems.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'No valid invoice quantities were provided' });
    }

    const invoiceNumber = await getNextNumber('SI', 'sales_invoices', 'invoice_number');

    const [invoiceResult] = await connection.query(
      `
      INSERT INTO sales_invoices
      (
        invoice_number,
        sales_order_id,
        customer_id,
        warehouse_id,
        invoice_date,
        due_date,
        status,
        delivery_status,
        remarks,
        total_amount
      )
      VALUES (?, ?, ?, ?, ?, ?, 'Posted', 'Not Delivered', ?, ?)
      `,
      [
        invoiceNumber,
        salesOrder.id,
        salesOrder.customer_id,
        salesOrder.warehouse_id,
        invoice_date,
        due_date || null,
        remarks?.trim() || salesOrder.remarks || null,
        round2(invoiceTotal),
      ]
    );

    const salesInvoiceId = invoiceResult.insertId;

    for (const item of normalizedInvoiceItems) {
      await connection.query(
        `
        INSERT INTO sales_invoice_items
        (
          sales_invoice_id,
          product_id,
          quantity,
          unit_price,
          line_total
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          salesInvoiceId,
          item.product_id,
          item.quantity,
          item.unit_price,
          item.line_total,
        ]
      );

      await connection.query(
        `
        UPDATE sales_order_items
        SET invoiced_quantity = invoiced_quantity + ?
        WHERE id = ?
        `,
        [item.quantity, item.sales_order_item_id]
      );
    }

    const newStatus = await getSalesOrderInvoiceStatus(connection, salesOrderId);

    await connection.query(
      `
      UPDATE sales_orders
      SET status = ?
      WHERE id = ?
      `,
      [newStatus, salesOrderId]
    );

    await connection.commit();

    const [[createdInvoice]] = await db.query(
      `
      SELECT *
      FROM sales_invoices
      WHERE id = ?
      `,
      [salesInvoiceId]
    );

    const [createdInvoiceItems] = await db.query(
      `
      SELECT *
      FROM sales_invoice_items
      WHERE sales_invoice_id = ?
      ORDER BY id ASC
      `,
      [salesInvoiceId]
    );

    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'CREATE',
        moduleName: 'Sales Invoices',
        recordId: salesInvoiceId,
        description: `Created sales invoice ${invoiceNumber} from sales order ${salesOrder.so_number}`,
        newValues: { ...createdInvoice, items: createdInvoiceItems },
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('Create invoice from sales order audit log error:', auditError);
    }

    res.status(201).json({
      message: 'Sales invoice created successfully from sales order',
      salesInvoice: createdInvoice,
      items: createdInvoiceItems,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create invoice from sales order error:', error);
    res.status(500).json({ message: 'Failed to create invoice from sales order' });
  } finally {
    connection.release();
  }
};