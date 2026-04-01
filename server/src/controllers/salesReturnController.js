import db from '../config/db.js';
import { buildScopeWhereClause, requireDataScope } from '../middleware/dataScopeMiddleware.js';
import { increaseWarehouseStock } from '../utils/inventoryStock.js';
import { createJournalEntry as createGLJournalEntry } from '../services/glPostingEngine.js';

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const getNextNumber = async (prefix) => {
  const stamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}-${stamp}${random}`;
};

const getAccountByCode = async (accountCode, scope) => {
  const [rows] = await db.query(
    `
    SELECT id, account_code, account_name
    FROM chart_of_accounts
    WHERE account_code = ? AND company_id = ? AND branch_id = ? AND business_unit_id = ?
    LIMIT 1
    `,
    [accountCode, scope.company_id, scope.branch_id, scope.business_unit_id]
  );

  return rows[0] || null;
};

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

const updateSalesInvoiceSettlementStatus = async (connection, salesInvoiceId) => {
  const [[invoice]] = await connection.query(
    `
    SELECT id, total_amount
    FROM sales_invoices
    WHERE id = ?
    LIMIT 1
    `,
    [salesInvoiceId]
  );

  if (!invoice) return;

  const [[totals]] = await connection.query(
    `
    SELECT
      COALESCE((
        SELECT SUM(amount_paid)
        FROM customer_payments
        WHERE sales_invoice_id = ?
      ), 0) AS total_paid,
      COALESCE((
        SELECT SUM(total_amount)
        FROM ar_credit_memos
        WHERE sales_invoice_id = ?
          AND status = 'Posted'
      ), 0) AS total_credited
    `,
    [salesInvoiceId, salesInvoiceId]
  );

  const totalPaid = round2(totals?.total_paid || 0);
  const totalCredited = round2(totals?.total_credited || 0);
  const openBalance = round2(Number(invoice.total_amount || 0) - totalPaid - totalCredited);

  let nextStatus = 'Posted';

  if (openBalance <= 0) {
    nextStatus = 'Paid';
  } else if (totalPaid > 0 || totalCredited > 0) {
    nextStatus = 'Partially Paid';
  }

  await connection.query(
    `
    UPDATE sales_invoices
    SET status = ?
    WHERE id = ?
    `,
    [nextStatus, salesInvoiceId]
  );
};

export const getReturnCandidates = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { sales_invoice_id = '', warehouse_id = '' } = req.query;

    let sql = `
      SELECT
        sd.id,
        sd.delivery_number,
        sd.sales_invoice_id,
        sd.warehouse_id,
        sd.delivery_date,
        si.invoice_number,
        si.customer_id,
        c.name AS customer_name,
        w.code AS warehouse_code,
        w.name AS warehouse_name
      FROM sales_deliveries sd
      INNER JOIN sales_invoices si
        ON si.id = sd.sales_invoice_id
      INNER JOIN customers c
        ON c.id = si.customer_id
      INNER JOIN warehouses w
        ON w.id = sd.warehouse_id
      WHERE sd.status = 'Posted'
        AND sd.company_id = ?
        AND sd.branch_id = ?
        AND sd.business_unit_id = ?
    `;
    const values = [scope.company_id, scope.branch_id, scope.business_unit_id];

    if (sales_invoice_id) {
      sql += ` AND sd.sales_invoice_id = ?`;
      values.push(Number(sales_invoice_id));
    }

    if (warehouse_id) {
      sql += ` AND sd.warehouse_id = ?`;
      values.push(Number(warehouse_id));
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
        sdi.line_cost,
        COALESCE((
          SELECT SUM(sri.returned_quantity)
          FROM sales_return_items sri
          INNER JOIN sales_returns sr
            ON sr.id = sri.sales_return_id
          WHERE sri.sales_delivery_item_id = sdi.id
            AND sr.status = 'Posted'
        ), 0) AS returned_quantity
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
      const remainingReturnable =
        Number(item.delivered_quantity || 0) - Number(item.returned_quantity || 0);

      if (remainingReturnable <= 0) continue;

      if (!itemMap.has(item.sales_delivery_id)) {
        itemMap.set(item.sales_delivery_id, []);
      }

      itemMap.get(item.sales_delivery_id).push({
        ...item,
        remaining_returnable: remainingReturnable,
      });
    }

    const result = deliveryRows
      .map((delivery) => ({
        ...delivery,
        items: itemMap.get(delivery.id) || [],
      }))
      .filter((delivery) => delivery.items.length > 0);

    res.json(result);
  } catch (error) {
    console.error('Get return candidates error:', error);
    res.status(500).json({ message: 'Failed to fetch return candidates' });
  }
};

export const getSalesReturns = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      sales_invoice_id = '',
      warehouse_id = '',
      date_from = '',
      date_to = '',
      search = '',
    } = req.query;

    let sql = `
      SELECT
        sr.id,
        sr.return_number,
        sr.sales_invoice_id,
        sr.sales_delivery_id,
        sr.warehouse_id,
        sr.return_date,
        sr.status,
        sr.remarks,
        sr.total_quantity,
        sr.total_cost,
        si.invoice_number,
        c.name AS customer_name,
        w.code AS warehouse_code,
        w.name AS warehouse_name
      FROM sales_returns sr
      INNER JOIN sales_invoices si
        ON si.id = sr.sales_invoice_id
      INNER JOIN customers c
        ON c.id = si.customer_id
      INNER JOIN warehouses w
        ON w.id = sr.warehouse_id
      WHERE sr.company_id = ?
        AND sr.branch_id = ?
        AND sr.business_unit_id = ?
    `;
    const values = [scope.company_id, scope.branch_id, scope.business_unit_id];

    if (sales_invoice_id) {
      sql += ` AND sr.sales_invoice_id = ?`;
      values.push(Number(sales_invoice_id));
    }

    if (warehouse_id) {
      sql += ` AND sr.warehouse_id = ?`;
      values.push(Number(warehouse_id));
    }

    if (date_from) {
      sql += ` AND sr.return_date >= ?`;
      values.push(date_from);
    }

    if (date_to) {
      sql += ` AND sr.return_date <= ?`;
      values.push(date_to);
    }

    if (search) {
      sql += ` AND (sr.return_number LIKE ? OR si.invoice_number LIKE ? OR c.name LIKE ?)`;
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY sr.return_date DESC, sr.id DESC`;

    const [returnRows] = await db.query(sql, values);

    if (!returnRows.length) {
      return res.json([]);
    }

    const returnIds = returnRows.map((row) => row.id);

    const [itemRows] = await db.query(
      `
      SELECT
        sri.id,
        sri.sales_return_id,
        sri.sales_delivery_item_id,
        sri.product_id,
        p.sku,
        p.name AS product_name,
        sri.returned_quantity,
        sri.unit_cost,
        sri.line_cost
      FROM sales_return_items sri
      INNER JOIN products p
        ON p.id = sri.product_id
      WHERE sri.sales_return_id IN (?)
      ORDER BY sri.sales_return_id DESC, sri.id ASC
      `,
      [returnIds]
    );

    const itemMap = new Map();

    for (const item of itemRows) {
      if (!itemMap.has(item.sales_return_id)) {
        itemMap.set(item.sales_return_id, []);
      }
      itemMap.get(item.sales_return_id).push(item);
    }

    res.json(
      returnRows.map((row) => ({
        ...row,
        items: itemMap.get(row.id) || [],
      }))
    );
  } catch (error) {
    console.error('Get sales returns error:', error);
    res.status(500).json({ message: 'Failed to fetch sales returns' });
  }
};

export const createSalesReturn = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const scope = requireDataScope(req);
    await connection.beginTransaction();

    const {
      sales_invoice_id,
      sales_delivery_id,
      warehouse_id,
      return_date,
      remarks = '',
      items = [],
    } = req.body;

    const salesInvoiceId = Number(sales_invoice_id);
    const salesDeliveryId = Number(sales_delivery_id);
    const warehouseId = Number(warehouse_id);

    if (!salesInvoiceId || !salesDeliveryId || !warehouseId || !return_date || !items.length) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Invoice, delivery, warehouse, return date, and items are required',
      });
    }

    const inventoryAccount = await getAccountByCode('1200', scope);
    const cogsAccount = await getAccountByCode('5000', scope);

    if (!inventoryAccount || !cogsAccount) {
      await connection.rollback();
      return res.status(400).json({
        message:
          'Required accounts are missing. Please ensure 1200 Inventory Asset and 5000 Cost of Goods Sold exist.',
      });
    }

    const returnNumber = await getNextNumber('SR', 'sales_returns', 'return_number');

    let totalQty = 0;
    let totalCost = 0;
    const preparedItems = [];

    for (const rawItem of items) {
      const salesDeliveryItemId = Number(rawItem.sales_delivery_item_id);
      const returnQty = Number(rawItem.returned_quantity);

      if (!salesDeliveryItemId || returnQty <= 0) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Each return item must have a valid delivery item and quantity',
        });
      }

      const [[deliveryItem]] = await connection.query(
        `
        SELECT
          sdi.id,
          sdi.sales_delivery_id,
          sdi.product_id,
          sdi.delivered_quantity,
          sdi.unit_cost,
          p.sku,
          p.name AS product_name
        FROM sales_delivery_items sdi
        INNER JOIN products p
          ON p.id = sdi.product_id
        WHERE sdi.id = ?
          AND sdi.sales_delivery_id = ?
        LIMIT 1
        `,
        [salesDeliveryItemId, salesDeliveryId]
      );

      if (!deliveryItem) {
        await connection.rollback();
        return res.status(404).json({
          message: `Delivery item not found: ${salesDeliveryItemId}`,
        });
      }

      const [[returnedRow]] = await connection.query(
        `
        SELECT COALESCE(SUM(sri.returned_quantity), 0) AS returned_quantity
        FROM sales_return_items sri
        INNER JOIN sales_returns sr
          ON sr.id = sri.sales_return_id
        WHERE sri.sales_delivery_item_id = ?
          AND sr.status = 'Posted'
        `,
        [salesDeliveryItemId]
      );

      const alreadyReturned = Number(returnedRow?.returned_quantity || 0);
      const remainingReturnable =
        Number(deliveryItem.delivered_quantity || 0) - alreadyReturned;

      if (returnQty > remainingReturnable) {
        await connection.rollback();
        return res.status(400).json({
          message: `${deliveryItem.sku} exceeds remaining returnable quantity. Remaining: ${remainingReturnable}`,
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
        [deliveryItem.product_id, warehouseId]
      );

      if (!stockRow) {
        await connection.rollback();
        return res.status(400).json({
          message: `No warehouse stock row found for ${deliveryItem.sku}`,
        });
      }

      const unitCost = round2(deliveryItem.unit_cost || stockRow.unit_cost || 0);
      const lineCost = round2(returnQty * unitCost);

      preparedItems.push({
        sales_delivery_item_id: salesDeliveryItemId,
        product_id: deliveryItem.product_id,
        sku: deliveryItem.sku,
        returned_quantity: returnQty,
        unit_cost: unitCost,
        line_cost: lineCost,
        previous_quantity: Number(stockRow.quantity || 0),
        new_quantity: Number(stockRow.quantity || 0) + returnQty,
      });

      totalQty += returnQty;
      totalCost = round2(totalCost + lineCost);
    }

    const [returnResult] = await connection.query(
      `
      INSERT INTO sales_returns
      (
        return_number,
        sales_invoice_id,
        sales_delivery_id,
        warehouse_id,
        return_date,
        status,
        remarks,
        total_quantity,
        total_cost
      )
      VALUES (?, ?, ?, ?, ?, 'Posted', ?, ?, ?)
      `,
      [
        returnNumber,
        salesInvoiceId,
        salesDeliveryId,
        warehouseId,
        return_date,
        remarks?.trim() || null,
        totalQty,
        totalCost,
      ]
    );

    const salesReturnId = returnResult.insertId;

    for (const item of preparedItems) {
      const stockChange = await increaseWarehouseStock(connection, {
        productId: item.product_id,
        warehouseId,
        quantity: item.returned_quantity,
        unitCost: item.unit_cost,
      });

      item.previous_quantity = stockChange.previousQuantity;
      item.new_quantity = stockChange.newQuantity;

      await connection.query(
        `
        INSERT INTO sales_return_items
        (
          sales_return_id,
          sales_delivery_item_id,
          product_id,
          returned_quantity,
          unit_cost,
          line_cost
        )
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          salesReturnId,
          item.sales_delivery_item_id,
          item.product_id,
          item.returned_quantity,
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
        VALUES (?, ?, 'Stock In', 'Sales Return', ?, ?, ?, ?, ?, ?)
        `,
        [
          item.product_id,
          warehouseId,
          salesReturnId,
          item.returned_quantity,
          item.previous_quantity,
          item.new_quantity,
          `Sales return ${returnNumber}`,
          returnNumber,
        ]
      );
    }

    await createGLJournalEntry(connection, {
      entryDate: return_date,
      referenceType: 'Sales Return',
      referenceId: salesReturnId,
      memo: `Reverse COGS for ${returnNumber}`,
      scope,
      lines: [
        {
          account_id: inventoryAccount.id,
          account_code: inventoryAccount.account_code,
          account_name: inventoryAccount.account_name,
          description: `Inventory return for ${returnNumber}`,
          debit: totalCost,
          credit: 0,
        },
        {
          account_id: cogsAccount.id,
          account_code: cogsAccount.account_code,
          account_name: cogsAccount.account_name,
          description: `COGS reversal for ${returnNumber}`,
          debit: 0,
          credit: totalCost,
        },
      ],
    });

    await updateSalesInvoiceDeliveryStatus(connection, salesInvoiceId);

    await connection.commit();

    res.status(201).json({
      id: salesReturnId,
      return_number: returnNumber,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create sales return error:', error);
    res.status(500).json({ message: error.message || 'Failed to create sales return' });
  } finally {
    connection.release();
  }
};

export const getCreditMemoCandidates = async (req, res) => {
  try {
    const { sales_invoice_id = '' } = req.query;

    let sql = `
      SELECT
        sr.id,
        sr.return_number,
        sr.sales_invoice_id,
        sr.return_date,
        sr.status,
        sr.remarks,
        si.invoice_number,
        si.customer_id,
        c.name AS customer_name,
        w.code AS warehouse_code,
        w.name AS warehouse_name
      FROM sales_returns sr
      INNER JOIN sales_invoices si
        ON si.id = sr.sales_invoice_id
      INNER JOIN customers c
        ON c.id = si.customer_id
      INNER JOIN warehouses w
        ON w.id = sr.warehouse_id
      WHERE sr.status = 'Posted'
    `;
    const values = [];

    if (sales_invoice_id) {
      sql += ` AND sr.sales_invoice_id = ?`;
      values.push(Number(sales_invoice_id));
    }

    sql += ` ORDER BY sr.return_date DESC, sr.id DESC`;

    const [returnRows] = await db.query(sql, values);

    if (!returnRows.length) {
      return res.json([]);
    }

    const returnIds = returnRows.map((row) => row.id);

    const [itemRows] = await db.query(
      `
      SELECT
        sri.id,
        sri.sales_return_id,
        sri.sales_delivery_item_id,
        sdi.sales_invoice_item_id,
        sri.product_id,
        p.sku,
        p.name AS product_name,
        sri.returned_quantity,
        sii.unit_price,
        COALESCE((
          SELECT SUM(acmi.quantity)
          FROM ar_credit_memo_items acmi
          INNER JOIN ar_credit_memos acm
            ON acm.id = acmi.ar_credit_memo_id
          WHERE acmi.sales_return_item_id = sri.id
            AND acm.status = 'Posted'
        ), 0) AS credited_quantity
      FROM sales_return_items sri
      INNER JOIN sales_delivery_items sdi
        ON sdi.id = sri.sales_delivery_item_id
      INNER JOIN sales_invoice_items sii
        ON sii.id = sdi.sales_invoice_item_id
      INNER JOIN products p
        ON p.id = sri.product_id
      WHERE sri.sales_return_id IN (?)
      ORDER BY sri.sales_return_id DESC, sri.id ASC
      `,
      [returnIds]
    );

    const itemMap = new Map();

    for (const item of itemRows) {
      const remainingCreditable =
        Number(item.returned_quantity || 0) - Number(item.credited_quantity || 0);

      if (remainingCreditable <= 0) continue;

      if (!itemMap.has(item.sales_return_id)) {
        itemMap.set(item.sales_return_id, []);
      }

      itemMap.get(item.sales_return_id).push({
        ...item,
        remaining_creditable: remainingCreditable,
        line_total: round2(remainingCreditable * Number(item.unit_price || 0)),
      });
    }

    const result = returnRows
      .map((row) => ({
        ...row,
        items: itemMap.get(row.id) || [],
      }))
      .filter((row) => row.items.length > 0);

    res.json(result);
  } catch (error) {
    console.error('Get credit memo candidates error:', error);
    res.status(500).json({ message: 'Failed to fetch credit memo candidates' });
  }
};

export const getArCreditMemos = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      sales_invoice_id = '',
      date_from = '',
      date_to = '',
      search = '',
    } = req.query;

    let sql = `
      SELECT
        acm.id,
        acm.credit_memo_number,
        acm.sales_return_id,
        acm.sales_invoice_id,
        acm.customer_id,
        acm.credit_date,
        acm.status,
        acm.remarks,
        acm.total_amount,
        sr.return_number,
        si.invoice_number,
        c.name AS customer_name
      FROM ar_credit_memos acm
      INNER JOIN sales_returns sr
        ON sr.id = acm.sales_return_id
      INNER JOIN sales_invoices si
        ON si.id = acm.sales_invoice_id
      INNER JOIN customers c
        ON c.id = acm.customer_id
      WHERE sr.company_id = ?
        AND sr.branch_id = ?
        AND sr.business_unit_id = ?
    `;
    const values = [scope.company_id, scope.branch_id, scope.business_unit_id];

    if (sales_invoice_id) {
      sql += ` AND acm.sales_invoice_id = ?`;
      values.push(Number(sales_invoice_id));
    }

    if (date_from) {
      sql += ` AND acm.credit_date >= ?`;
      values.push(date_from);
    }

    if (date_to) {
      sql += ` AND acm.credit_date <= ?`;
      values.push(date_to);
    }

    if (search) {
      sql += ` AND (acm.credit_memo_number LIKE ? OR sr.return_number LIKE ? OR si.invoice_number LIKE ? OR c.name LIKE ?)`;
      values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY acm.credit_date DESC, acm.id DESC`;

    const [creditMemoRows] = await db.query(sql, values);

    if (!creditMemoRows.length) {
      return res.json([]);
    }

    const creditMemoIds = creditMemoRows.map((row) => row.id);

    const [itemRows] = await db.query(
      `
      SELECT
        acmi.id,
        acmi.ar_credit_memo_id,
        acmi.sales_return_item_id,
        acmi.sales_delivery_item_id,
        acmi.sales_invoice_item_id,
        acmi.product_id,
        p.sku,
        p.name AS product_name,
        acmi.quantity,
        acmi.unit_price,
        acmi.line_total
      FROM ar_credit_memo_items acmi
      INNER JOIN products p
        ON p.id = acmi.product_id
      WHERE acmi.ar_credit_memo_id IN (?)
      ORDER BY acmi.ar_credit_memo_id DESC, acmi.id ASC
      `,
      [creditMemoIds]
    );

    const itemMap = new Map();

    for (const item of itemRows) {
      if (!itemMap.has(item.ar_credit_memo_id)) {
        itemMap.set(item.ar_credit_memo_id, []);
      }
      itemMap.get(item.ar_credit_memo_id).push(item);
    }

    res.json(
      creditMemoRows.map((row) => ({
        ...row,
        items: itemMap.get(row.id) || [],
      }))
    );
  } catch (error) {
    console.error('Get AR credit memos error:', error);
    res.status(500).json({ message: 'Failed to fetch AR credit memos' });
  }
};

export const createArCreditMemo = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const scope = requireDataScope(req);
    await connection.beginTransaction();

    const {
      sales_return_id,
      credit_date,
      remarks = '',
      items = [],
    } = req.body;

    const salesReturnId = Number(sales_return_id);

    if (!salesReturnId || !credit_date || !Array.isArray(items) || items.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Sales return, credit date, and at least one item are required',
      });
    }

    const [[salesReturn]] = await connection.query(
      `
      SELECT
        sr.id,
        sr.return_number,
        sr.sales_invoice_id,
        sr.company_id,
        sr.branch_id,
        sr.business_unit_id,
        si.customer_id,
        si.invoice_number,
        si.total_amount
      FROM sales_returns sr
      INNER JOIN sales_invoices si
        ON si.id = sr.sales_invoice_id
      WHERE sr.id = ?
        AND sr.status = 'Posted'
      LIMIT 1
      `,
      [salesReturnId]
    );

    if (!salesReturn) {
      await connection.rollback();
      return res.status(404).json({ message: 'Posted sales return not found' });
    }

    assertScopeMatch(salesReturn, scope);

    const arAccount = await getAccountByCode('1100', scope);
    const salesReturnsAccount = await getAccountByCode('4010', scope);

    if (!arAccount || !salesReturnsAccount) {
      await connection.rollback();
      return res.status(400).json({
        message:
          'Required accounts are missing. Please ensure 1100 Accounts Receivable and 4010 Sales Returns and Allowances exist.',
      });
    }

    const creditMemoNumber = await getNextNumber('CM', 'ar_credit_memos', 'credit_memo_number');

    let totalAmount = 0;
    const preparedItems = [];

    for (const rawItem of items) {
      const salesReturnItemId = Number(rawItem.sales_return_item_id);
      const creditQty = Number(rawItem.quantity);

      if (!salesReturnItemId || creditQty <= 0) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Each credit memo item must have a valid sales return item and quantity',
        });
      }

      const [[returnItem]] = await connection.query(
        `
        SELECT
          sri.id,
          sri.sales_return_id,
          sri.sales_delivery_item_id,
          sdi.sales_invoice_item_id,
          sri.product_id,
          sri.returned_quantity,
          sii.unit_price,
          p.sku,
          p.name AS product_name
        FROM sales_return_items sri
        INNER JOIN sales_delivery_items sdi
          ON sdi.id = sri.sales_delivery_item_id
        INNER JOIN sales_invoice_items sii
          ON sii.id = sdi.sales_invoice_item_id
        INNER JOIN products p
          ON p.id = sri.product_id
        WHERE sri.id = ?
          AND sri.sales_return_id = ?
        LIMIT 1
        `,
        [salesReturnItemId, salesReturnId]
      );

      if (!returnItem) {
        await connection.rollback();
        return res.status(404).json({
          message: `Sales return item not found: ${salesReturnItemId}`,
        });
      }

      const [[creditedRow]] = await connection.query(
        `
        SELECT COALESCE(SUM(acmi.quantity), 0) AS credited_quantity
        FROM ar_credit_memo_items acmi
        INNER JOIN ar_credit_memos acm
          ON acm.id = acmi.ar_credit_memo_id
        WHERE acmi.sales_return_item_id = ?
          AND acm.status = 'Posted'
        `,
        [salesReturnItemId]
      );

      const alreadyCredited = Number(creditedRow?.credited_quantity || 0);
      const remainingCreditable =
        Number(returnItem.returned_quantity || 0) - alreadyCredited;

      if (creditQty > remainingCreditable) {
        await connection.rollback();
        return res.status(400).json({
          message: `${returnItem.sku} exceeds remaining creditable quantity. Remaining: ${remainingCreditable}`,
        });
      }

      const unitPrice = round2(returnItem.unit_price || 0);
      const lineTotal = round2(creditQty * unitPrice);

      preparedItems.push({
        sales_return_item_id: salesReturnItemId,
        sales_delivery_item_id: returnItem.sales_delivery_item_id,
        sales_invoice_item_id: returnItem.sales_invoice_item_id,
        product_id: returnItem.product_id,
        sku: returnItem.sku,
        quantity: creditQty,
        unit_price: unitPrice,
        line_total: lineTotal,
      });

      totalAmount = round2(totalAmount + lineTotal);
    }

    const [[existingCreditTotals]] = await connection.query(
      `
      SELECT COALESCE(SUM(total_amount), 0) AS total_credited
      FROM ar_credit_memos
      WHERE sales_invoice_id = ?
        AND status = 'Posted'
      `,
      [salesReturn.sales_invoice_id]
    );

    const existingCredited = round2(existingCreditTotals?.total_credited || 0);
    const remainingReceivable = round2(Number(salesReturn.total_amount || 0) - existingCredited);

    if (totalAmount > remainingReceivable) {
      await connection.rollback();
      return res.status(400).json({
        message: `Credit memo exceeds remaining invoice receivable of ${remainingReceivable.toFixed(2)}`,
      });
    }

    const [creditMemoResult] = await connection.query(
      `
      INSERT INTO ar_credit_memos
      (
        credit_memo_number,
        sales_return_id,
        sales_invoice_id,
        customer_id,
        credit_date,
        status,
        remarks,
        total_amount,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, ?, ?, ?, 'Posted', ?, ?, ?, ?, ?)
      `,
      [
        creditMemoNumber,
        salesReturnId,
        salesReturn.sales_invoice_id,
        salesReturn.customer_id,
        credit_date,
        remarks?.trim() || null,
        totalAmount,
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
      ]
    );

    const creditMemoId = creditMemoResult.insertId;

    for (const item of preparedItems) {
      await connection.query(
        `
        INSERT INTO ar_credit_memo_items
        (
          ar_credit_memo_id,
          sales_return_item_id,
          sales_delivery_item_id,
          sales_invoice_item_id,
          product_id,
          quantity,
          unit_price,
          line_total
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          creditMemoId,
          item.sales_return_item_id,
          item.sales_delivery_item_id,
          item.sales_invoice_item_id,
          item.product_id,
          item.quantity,
          item.unit_price,
          item.line_total,
        ]
      );
    }

    await createGLJournalEntry(connection, {
      entryDate: credit_date,
      referenceType: 'AR Credit Memo',
      referenceId: creditMemoId,
      memo: `AR credit memo posting for ${creditMemoNumber}`,
      scope,
      lines: [
        {
          account_id: salesReturnsAccount.id,
          account_code: salesReturnsAccount.account_code,
          account_name: salesReturnsAccount.account_name,
          description: `Sales return allowance for ${creditMemoNumber}`,
          debit: totalAmount,
          credit: 0,
        },
        {
          account_id: arAccount.id,
          account_code: arAccount.account_code,
          account_name: arAccount.account_name,
          description: `Reduce AR for ${creditMemoNumber}`,
          debit: 0,
          credit: totalAmount,
        },
      ],
    });

    await updateSalesInvoiceSettlementStatus(connection, salesReturn.sales_invoice_id);

    await connection.commit();

    res.status(201).json({
      id: creditMemoId,
      credit_memo_number: creditMemoNumber,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create AR credit memo error:', error);
    res.status(500).json({ message: error.message || 'Failed to create AR credit memo' });
  } finally {
    connection.release();
  }
};
