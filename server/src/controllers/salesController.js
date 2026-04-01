import db from '../config/db.js';
import { createAuditLog, getRequestIp } from '../utils/auditTrail.js';
import {
  assertScopeMatch,
  buildScopeWhereClause,
  requireDataScope,
} from '../middleware/dataScopeMiddleware.js';

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const getNextNumber = async (prefix) => {
  const stamp = Date.now();
  const suffix = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');

  return `${prefix}-${stamp}${suffix}`;
};

const getAccountByCode = async (accountCode, scope, connection = db) => {
  const scopeFilter = buildScopeWhereClause(scope, {
    company: 'company_id',
    branch: 'branch_id',
    businessUnit: 'business_unit_id',
  });

  const [rows] = await connection.query(
    `
    SELECT id, account_code, account_name, account_type, company_id, branch_id, business_unit_id
    FROM chart_of_accounts
    WHERE account_code = ? ${scopeFilter.sql}
    LIMIT 1
    `,
    [accountCode, ...scopeFilter.values]
  );

  return rows[0] || null;
};

const getSalesInvoiceSettlementStatus = ({ totalAmount, totalPaid, totalCredited }) => {
  const openBalance = round2(
    Number(totalAmount || 0) - Number(totalPaid || 0) - Number(totalCredited || 0)
  );

  if (openBalance <= 0) return 'Paid';
  if (Number(totalPaid || 0) > 0 || Number(totalCredited || 0) > 0) return 'Partially Paid';
  return 'Posted';
};

const getInvoiceDeliveryStatus = async (connection, salesInvoiceId) => {
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

  if (invoiceQty <= 0) return 'Not Delivered';
  if (deliveredQty <= 0) return 'Not Delivered';
  if (deliveredQty < invoiceQty) return 'Partially Delivered';
  return 'Fully Delivered';
};

/* -------------------- CUSTOMERS -------------------- */

export const getCustomers = async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;

    let sql = `
      SELECT
        id,
        customer_code,
        name,
        contact_person,
        email,
        phone,
        address,
        status,
        created_at,
        updated_at
      FROM customers
      WHERE 1 = 1 ${customerScope.sql}
    `;
    const values = [...customerScope.values];

    if (search) {
      sql += ` AND (customer_code LIKE ? OR name LIKE ? OR contact_person LIKE ?)`;
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
      sql += ` AND status = ?`;
      values.push(status);
    }

    sql += ` ORDER BY name ASC, id ASC`;

    const [rows] = await db.query(sql, values);
    res.json(rows);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
};

export const createCustomer = async (req, res) => {
  try {
    const {
      customer_code,
      name,
      contact_person = '',
      email = '',
      phone = '',
      address = '',
      status = 'Active',
    } = req.body;

    if (!customer_code?.trim() || !name?.trim()) {
      return res.status(400).json({
        message: 'Customer code and customer name are required',
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO customers
      (
        customer_code,
        name,
        contact_person,
        email,
        phone,
        address,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        customer_code.trim(),
        name.trim(),
        contact_person.trim(),
        email.trim(),
        phone.trim(),
        address.trim(),
        status,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT *
      FROM customers
      WHERE id = ?
      `,
      [result.insertId]
    );

    const createdCustomer = rows[0];

    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'CREATE',
        moduleName: 'Customers',
        recordId: createdCustomer.id,
        description: `Created customer ${createdCustomer.name}`,
        newValues: createdCustomer,
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('Create customer audit log error:', auditError);
    }

    res.status(201).json(createdCustomer);
  } catch (error) {
    console.error('Create customer error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Customer code already exists' });
    }

    res.status(500).json({ message: 'Failed to create customer' });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const customerId = Number(id);

    const {
      customer_code,
      name,
      contact_person = '',
      email = '',
      phone = '',
      address = '',
      status = 'Active',
    } = req.body;

    if (!customerId) {
      return res.status(400).json({ message: 'Invalid customer id' });
    }

    if (!customer_code?.trim() || !name?.trim()) {
      return res.status(400).json({
        message: 'Customer code and customer name are required',
      });
    }

    const [existingRows] = await db.query(
      `
      SELECT *
      FROM customers
      WHERE id = ?
      `,
      [customerId]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const existingCustomer = existingRows[0];

    await db.query(
      `
      UPDATE customers
      SET
        customer_code = ?,
        name = ?,
        contact_person = ?,
        email = ?,
        phone = ?,
        address = ?,
        status = ?
      WHERE id = ?
      `,
      [
        customer_code.trim(),
        name.trim(),
        contact_person.trim(),
        email.trim(),
        phone.trim(),
        address.trim(),
        status,
        customerId,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT *
      FROM customers
      WHERE id = ?
      `,
      [customerId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const updatedCustomer = rows[0];

    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'UPDATE',
        moduleName: 'Customers',
        recordId: updatedCustomer.id,
        description: `Updated customer ${updatedCustomer.name}`,
        oldValues: existingCustomer,
        newValues: updatedCustomer,
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('Update customer audit log error:', auditError);
    }

    res.json(updatedCustomer);
  } catch (error) {
    console.error('Update customer error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Customer code already exists' });
    }

    res.status(500).json({ message: 'Failed to update customer' });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const customerId = Number(req.params.id);

    if (!customerId) {
      return res.status(400).json({ message: 'Invalid customer id' });
    }

    const [existingRows] = await db.query(
      `
      SELECT *
      FROM customers
      WHERE id = ?
      `,
      [customerId]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const existingCustomer = existingRows[0];

    const [[invoiceRow]] = await db.query(
      `
      SELECT id
      FROM sales_invoices
      WHERE customer_id = ?
      LIMIT 1
      `,
      [customerId]
    );

    if (invoiceRow) {
      return res.status(400).json({
        message:
          'This customer already has sales invoices. Set it inactive instead of deleting.',
      });
    }

    const [result] = await db.query(
      `
      DELETE FROM customers
      WHERE id = ?
      `,
      [customerId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'DELETE',
        moduleName: 'Customers',
        recordId: existingCustomer.id,
        description: `Deleted customer ${existingCustomer.name}`,
        oldValues: existingCustomer,
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('Delete customer audit log error:', auditError);
    }

    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ message: 'Failed to delete customer' });
  }
};

/* -------------------- SALES INVOICES -------------------- */

export const getSalesInvoices = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { customer_id = '', status = '', date_from = '', date_to = '', search = '' } = req.query;
    const customerScope = buildScopeWhereClause(scope, {
      company: 'c.company_id',
      branch: 'c.branch_id',
      businessUnit: 'c.business_unit_id',
    });

    let sql = `
      SELECT
        si.id,
        si.invoice_number,
        si.customer_id,
        c.name AS customer_name,
        si.invoice_date,
        si.due_date,
        si.status,
        si.delivery_status,
        si.remarks,
        si.total_amount,
        COALESCE((
          SELECT SUM(cp.amount_paid)
          FROM customer_payments cp
          WHERE cp.sales_invoice_id = si.id
        ), 0) AS total_paid,
        COALESCE((
          SELECT SUM(acm.total_amount)
          FROM ar_credit_memos acm
          WHERE acm.sales_invoice_id = si.id
            AND acm.status = 'Posted'
        ), 0) AS total_credited,
        ROUND(
          si.total_amount
          - COALESCE((
              SELECT SUM(cp.amount_paid)
              FROM customer_payments cp
              WHERE cp.sales_invoice_id = si.id
            ), 0)
          - COALESCE((
              SELECT SUM(acm.total_amount)
              FROM ar_credit_memos acm
              WHERE acm.sales_invoice_id = si.id
                AND acm.status = 'Posted'
            ), 0),
          2
        ) AS balance
      FROM sales_invoices si
      INNER JOIN customers c
        ON si.customer_id = c.id
      WHERE 1 = 1 ${customerScope.sql}
    `;
    const values = [...customerScope.values];

    if (customer_id) {
      sql += ` AND si.customer_id = ?`;
      values.push(Number(customer_id));
    }

    if (status) {
      sql += ` AND si.status = ?`;
      values.push(status);
    }

    if (date_from) {
      sql += ` AND si.invoice_date >= ?`;
      values.push(date_from);
    }

    if (date_to) {
      sql += ` AND si.invoice_date <= ?`;
      values.push(date_to);
    }

    if (search) {
      sql += ` AND (si.invoice_number LIKE ? OR c.name LIKE ?)`;
      values.push(`%${search}%`, `%${search}%`);
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
        p.name AS product_name,
        p.sku,
        sii.quantity,
        sii.unit_price,
        sii.line_total,
        COALESCE((
          SELECT SUM(sdi.delivered_quantity)
          FROM sales_delivery_items sdi
          INNER JOIN sales_deliveries sd
            ON sd.id = sdi.sales_delivery_id
          WHERE sdi.sales_invoice_item_id = sii.id
            AND sd.status = 'Posted'
        ), 0) AS delivered_quantity,
        COALESCE((
          SELECT SUM(sri.returned_quantity)
          FROM sales_return_items sri
          INNER JOIN sales_delivery_items sdi2
            ON sdi2.id = sri.sales_delivery_item_id
          INNER JOIN sales_returns sr
            ON sr.id = sri.sales_return_id
          WHERE sdi2.sales_invoice_item_id = sii.id
            AND sr.status = 'Posted'
        ), 0) AS returned_quantity,
        COALESCE((
          SELECT SUM(acmi.quantity)
          FROM ar_credit_memo_items acmi
          INNER JOIN ar_credit_memos acm
            ON acm.id = acmi.ar_credit_memo_id
          WHERE acmi.sales_invoice_item_id = sii.id
            AND acm.status = 'Posted'
        ), 0) AS credited_quantity
      FROM sales_invoice_items sii
      INNER JOIN products p
        ON p.id = sii.product_id
      WHERE sii.sales_invoice_id IN (?)
      ORDER BY sii.sales_invoice_id DESC, sii.id ASC
      `,
      [invoiceIds]
    );

    const itemMap = new Map();

    for (const item of itemRows) {
      if (!itemMap.has(item.sales_invoice_id)) {
        itemMap.set(item.sales_invoice_id, []);
      }

      itemMap.get(item.sales_invoice_id).push({
        ...item,
        remaining_to_deliver:
          Number(item.quantity || 0) - Number(item.delivered_quantity || 0),
      });
    }

    const result = invoiceRows.map((invoice) => {
      const items = itemMap.get(invoice.id) || [];
      const billedQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const deliveredQty = items.reduce(
        (sum, item) => sum + Number(item.delivered_quantity || 0),
        0
      );
      const returnedQty = items.reduce(
        (sum, item) => sum + Number(item.returned_quantity || 0),
        0
      );
      const creditedQty = items.reduce(
        (sum, item) => sum + Number(item.credited_quantity || 0),
        0
      );

      return {
        ...invoice,
        billed_quantity: billedQty,
        delivered_quantity: deliveredQty,
        returned_quantity: returnedQty,
        credited_quantity: creditedQty,
        items,
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Get sales invoices error:', error);
    res.status(500).json({ message: 'Failed to fetch sales invoices' });
  }
};

export const createSalesInvoice = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const scope = requireDataScope(req);
    await connection.beginTransaction();

    const {
      customer_id,
      invoice_date,
      due_date = null,
      remarks = '',
      items = [],
    } = req.body;

    if (!customer_id || !invoice_date || !Array.isArray(items) || items.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Customer, invoice date, and at least one item are required',
      });
    }

    const [[customer]] = await connection.query(
      `
      SELECT id, name, status, company_id, branch_id, business_unit_id
      FROM customers
      WHERE id = ?
      LIMIT 1
      `,
      [Number(customer_id)]
    );

    if (!customer) {
      await connection.rollback();
      return res.status(404).json({ message: 'Customer not found' });
    }

    assertScopeMatch(customer, scope);

    if (customer.status !== 'Active') {
      await connection.rollback();
      return res.status(400).json({ message: 'Customer is inactive' });
    }

    const arAccount = await getAccountByCode('1100', scope, connection);
    const salesRevenueAccount = await getAccountByCode('4000', scope, connection);

    if (!arAccount || !salesRevenueAccount) {
      await connection.rollback();
      return res.status(400).json({
        message:
          'Required accounts are missing. Please add 1100 Accounts Receivable and 4000 Sales Revenue.',
      });
    }

    let totalAmount = 0;
    const preparedItems = [];

    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unit_price);

      if (!productId || quantity <= 0 || unitPrice < 0) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Each item must have a valid product, quantity, and unit price',
        });
      }

      const [[product]] = await connection.query(
        `
        SELECT id, name, sku, company_id, branch_id, business_unit_id
        FROM products
        WHERE id = ?
        LIMIT 1
        `,
        [productId]
      );

      if (!product) {
        await connection.rollback();
        return res.status(404).json({ message: `Product not found: ${productId}` });
      }

      assertScopeMatch(product, scope);

      const lineTotal = round2(quantity * unitPrice);
      totalAmount = round2(totalAmount + lineTotal);

      preparedItems.push({
        product_id: productId,
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    const invoiceNumber = await getNextNumber('SI');

    const [invoiceResult] = await connection.query(
      `
      INSERT INTO sales_invoices
      (
        invoice_number,
        customer_id,
        invoice_date,
        due_date,
        status,
        remarks,
        total_amount,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, ?, ?, 'Posted', ?, ?, ?, ?, ?)
      `,
      [
        invoiceNumber,
        Number(customer_id),
        invoice_date,
        due_date || null,
        remarks?.trim() || null,
        totalAmount,
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
      ]
    );

    const salesInvoiceId = invoiceResult.insertId;

    for (const item of preparedItems) {
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
    }

    const entryNumber = await getNextNumber('JE');

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
        status,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, 'Sales Invoice', ?, ?, ?, ?, 'Posted', ?, ?, ?)
      `,
      [
        entryNumber,
        invoice_date,
        salesInvoiceId,
        `Sales invoice posting for ${invoiceNumber}`,
        totalAmount,
        totalAmount,
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
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
        arAccount.id,
        arAccount.account_code,
        arAccount.account_name,
        `AR for ${invoiceNumber}`,
        totalAmount,

        journalEntryId,
        salesRevenueAccount.id,
        salesRevenueAccount.account_code,
        salesRevenueAccount.account_name,
        `Revenue for ${invoiceNumber}`,
        totalAmount,
      ]
    );

    await connection.commit();

  
    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'CREATE',
        moduleName: 'Sales Invoices',
        recordId: salesInvoiceId,
        description: `Created sales invoice ${invoiceNumber}`,
        newValues: {
          sales_invoice_id: salesInvoiceId,
          invoice_number: invoiceNumber,
          customer_id,
          invoice_date,
          due_date,
          total_amount: totalAmount,
          status: 'Posted',
          items: preparedItems,
        },
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('Sales invoice audit log error:', auditError);
    }

    const [rows] = await connection.query(
      `
      SELECT
        si.*,
        c.name AS customer_name
      FROM sales_invoices si
      INNER JOIN customers c
        ON si.customer_id = c.id
      WHERE si.id = ?
      `,
      [salesInvoiceId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Create sales invoice error:', error);
    res.status(500).json({ message: 'Failed to create sales invoice' });
  } finally {
    connection.release();
  }
};

/* -------------------- CUSTOMER PAYMENTS -------------------- */

export const getCustomerPayments = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { customer_id = '', sales_invoice_id = '', date_from = '', date_to = '' } = req.query;
    const customerScope = buildScopeWhereClause(scope, {
      company: 'c.company_id',
      branch: 'c.branch_id',
      businessUnit: 'c.business_unit_id',
    });

    let sql = `
      SELECT
        cp.id,
        cp.payment_number,
        cp.sales_invoice_id,
        cp.payment_date,
        cp.payment_method,
        cp.reference_number,
        cp.amount_paid,
        cp.remarks,
        si.invoice_number,
        si.customer_id,
        c.name AS customer_name
      FROM customer_payments cp
      INNER JOIN sales_invoices si
        ON cp.sales_invoice_id = si.id
      INNER JOIN customers c
        ON si.customer_id = c.id
      WHERE 1 = 1 ${customerScope.sql}
    `;
    const values = [...customerScope.values];

    if (customer_id) {
      sql += ` AND si.customer_id = ?`;
      values.push(Number(customer_id));
    }

    if (sales_invoice_id) {
      sql += ` AND cp.sales_invoice_id = ?`;
      values.push(Number(sales_invoice_id));
    }

    if (date_from) {
      sql += ` AND cp.payment_date >= ?`;
      values.push(date_from);
    }

    if (date_to) {
      sql += ` AND cp.payment_date <= ?`;
      values.push(date_to);
    }

    sql += ` ORDER BY cp.payment_date DESC, cp.id DESC`;

    const [rows] = await db.query(sql, values);
    res.json(rows);
  } catch (error) {
    console.error('Get customer payments error:', error);
    res.status(500).json({ message: 'Failed to fetch customer payments' });
  }
};

export const createCustomerPayment = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const scope = requireDataScope(req);
    await connection.beginTransaction();

    const {
      sales_invoice_id,
      payment_date,
      payment_method = 'Cash',
      reference_number = '',
      amount_paid,
      remarks = '',
    } = req.body;

    const invoiceId = Number(sales_invoice_id);
    const paymentAmount = round2(amount_paid);

    if (!invoiceId || !payment_date || paymentAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Sales invoice, payment date, and valid amount are required',
      });
    }

    const [[invoice]] = await connection.query(
      `
      SELECT
        si.id,
        si.invoice_number,
        si.invoice_date,
        si.total_amount,
        si.status,
        si.customer_id,
        c.name AS customer_name,
        c.company_id,
        c.branch_id,
        c.business_unit_id,
        COALESCE((
          SELECT SUM(cp.amount_paid)
          FROM customer_payments cp
          WHERE cp.sales_invoice_id = si.id
        ), 0) AS total_paid,
        COALESCE((
          SELECT SUM(acm.total_amount)
          FROM ar_credit_memos acm
          WHERE acm.sales_invoice_id = si.id
            AND acm.status = 'Posted'
        ), 0) AS total_credited
      FROM sales_invoices si
      INNER JOIN customers c
        ON si.customer_id = c.id
      WHERE si.id = ?
      LIMIT 1
      `,
      [invoiceId]
    );

    if (!invoice) {
      await connection.rollback();
      return res.status(404).json({ message: 'Sales invoice not found' });
    }

    assertScopeMatch(invoice, scope);

    if (invoice.status === 'Cancelled') {
      await connection.rollback();
      return res.status(400).json({ message: 'Cannot pay a cancelled invoice' });
    }

    const balance = round2(invoice.total_amount - invoice.total_paid - invoice.total_credited);

    if (paymentAmount > balance) {
      await connection.rollback();
      return res.status(400).json({
        message: `Payment exceeds open balance of ${balance.toFixed(2)}`,
      });
    }

    const cashAccount = await getAccountByCode('1000', scope, connection);
    const arAccount = await getAccountByCode('1100', scope, connection);

    if (!cashAccount || !arAccount) {
      await connection.rollback();
      return res.status(400).json({
        message:
          'Required accounts are missing. Please ensure 1000 Cash in Bank and 1100 Accounts Receivable exist.',
      });
    }

    const paymentNumber = await getNextNumber('CR');

    const [paymentResult] = await connection.query(
      `
      INSERT INTO customer_payments
      (
        payment_number,
        sales_invoice_id,
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
        reference_number?.trim() || null,
        paymentAmount,
        remarks?.trim() || null,
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
      ]
    );

    const [[paymentTotals]] = await connection.query(
      `
      SELECT COALESCE(SUM(amount_paid), 0) AS total_paid
      FROM customer_payments
      WHERE sales_invoice_id = ?
      `,
      [invoiceId]
    );

    const [[creditTotals]] = await connection.query(
      `
      SELECT COALESCE(SUM(total_amount), 0) AS total_credited
      FROM ar_credit_memos
      WHERE sales_invoice_id = ?
        AND status = 'Posted'
      `,
      [invoiceId]
    );

    const newTotalPaid = round2(paymentTotals.total_paid);
    const newTotalCredited = round2(creditTotals.total_credited);
    const newStatus = getSalesInvoiceSettlementStatus({
      totalAmount: invoice.total_amount,
      totalPaid: newTotalPaid,
      totalCredited: newTotalCredited,
    });

    await connection.query(
      `
      UPDATE sales_invoices
      SET status = ?
      WHERE id = ?
      `,
      [newStatus, invoiceId]
    );

    const entryNumber = await getNextNumber('JE');

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
        status,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, 'Customer Payment', ?, ?, ?, ?, 'Posted', ?, ?, ?)
      `,
      [
        entryNumber,
        payment_date,
        paymentResult.insertId,
        `Customer payment posting for ${paymentNumber}`,
        paymentAmount,
        paymentAmount,
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
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
        cashAccount.id,
        cashAccount.account_code,
        cashAccount.account_name,
        `Cash receipt for ${paymentNumber}`,
        paymentAmount,

        journalEntryId,
        arAccount.id,
        arAccount.account_code,
        arAccount.account_name,
        `AR settlement for ${paymentNumber}`,
        paymentAmount,
      ]
    );

    await connection.commit();

    const paymentId = paymentResult.insertId;

    try {
      await createAuditLog({
        userId: req.user?.id || null,
        action: 'CREATE',
        moduleName: 'AR Payments',
        recordId: paymentId,
        description: `Created customer payment ${paymentNumber} for invoice ${invoice.invoice_number}`,
        newValues: {
          customer_payment_id: paymentId,
          payment_number: paymentNumber,
          sales_invoice_id: invoiceId,
          payment_date,
          payment_method,
          reference_number: reference_number?.trim() || null,
          amount_paid: paymentAmount,
          customer_id: invoice.customer_id,
          previous_total_paid: round2(invoice.total_paid),
          previous_total_credited: round2(invoice.total_credited),
          new_total_paid: newTotalPaid,
          new_total_credited: newTotalCredited,
          invoice_status: newStatus,
        },
        ipAddress: getRequestIp(req),
      });
    } catch (auditError) {
      console.error('Customer payment audit log error:', auditError);
    }

    const [rows] = await connection.query(
      `
      SELECT
        cp.*,
        si.invoice_number,
        si.customer_id,
        c.name AS customer_name
      FROM customer_payments cp
      INNER JOIN sales_invoices si
        ON cp.sales_invoice_id = si.id
      INNER JOIN customers c
        ON si.customer_id = c.id
      WHERE cp.id = ?
      `,
      [paymentId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Create customer payment error:', error);
    res.status(500).json({ message: 'Failed to create customer payment' });
  } finally {
    connection.release();
  }
};

/* -------------------- AR AGING -------------------- */

export const getArAgingReport = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { customer_id = '', as_of_date = '' } = req.query;
    const asOf = as_of_date || new Date().toISOString().split('T')[0];

    let sql = `
      SELECT
        si.id,
        si.invoice_number,
        si.customer_id,
        c.name AS customer_name,
        si.invoice_date,
        si.due_date,
        si.status,
        si.total_amount,
        COALESCE((
          SELECT SUM(cp.amount_paid)
          FROM customer_payments cp
          WHERE cp.sales_invoice_id = si.id
            ${as_of_date ? 'AND cp.payment_date <= ?' : ''}
        ), 0) AS total_paid,
        COALESCE((
          SELECT SUM(acm.total_amount)
          FROM ar_credit_memos acm
          WHERE acm.sales_invoice_id = si.id
            AND acm.status = 'Posted'
            ${as_of_date ? 'AND acm.credit_date <= ?' : ''}
        ), 0) AS total_credited
      FROM sales_invoices si
      INNER JOIN customers c
        ON si.customer_id = c.id
      WHERE si.status IN ('Posted', 'Partially Paid', 'Paid') ${buildScopeWhereClause(scope, { company: 'c.company_id', branch: 'c.branch_id', businessUnit: 'c.business_unit_id' }).sql}
        ${customer_id ? 'AND si.customer_id = ?' : ''}
        ${as_of_date ? 'AND si.invoice_date <= ?' : ''}
      ORDER BY c.name ASC, si.due_date ASC, si.invoice_date ASC, si.id ASC
    `;

    const arCustomerScope = buildScopeWhereClause(scope, { company: 'c.company_id', branch: 'c.branch_id', businessUnit: 'c.business_unit_id' });
    const values = [...arCustomerScope.values];
    if (as_of_date) values.push(as_of_date);
    if (as_of_date) values.push(as_of_date);
    if (customer_id) values.push(Number(customer_id));
    if (as_of_date) values.push(as_of_date);

    const [rows] = await db.query(sql, values);

    const detailed = rows
      .map((row) => {
        const totalAmount = round2(row.total_amount);
        const totalPaid = round2(row.total_paid);
        const totalCredited = round2(row.total_credited);
        const balance = round2(totalAmount - totalPaid - totalCredited);

        if (balance <= 0) return null;

        let ageDays = 0;
        if (row.due_date) {
          const due = new Date(row.due_date);
          const asOfDt = new Date(asOf);
          ageDays = Math.floor((asOfDt - due) / (1000 * 60 * 60 * 24));
        }

        let current = 0;
        let bucket_1_30 = 0;
        let bucket_31_60 = 0;
        let bucket_61_90 = 0;
        let bucket_over_90 = 0;

        if (!row.due_date || ageDays <= 0) {
          current = balance;
        } else if (ageDays <= 30) {
          bucket_1_30 = balance;
        } else if (ageDays <= 60) {
          bucket_31_60 = balance;
        } else if (ageDays <= 90) {
          bucket_61_90 = balance;
        } else {
          bucket_over_90 = balance;
        }

        return {
          ...row,
          total_amount: totalAmount,
          total_paid: totalPaid,
          total_credited: totalCredited,
          balance,
          age_days: ageDays > 0 ? ageDays : 0,
          current,
          bucket_1_30,
          bucket_31_60,
          bucket_61_90,
          bucket_over_90,
        };
      })
      .filter(Boolean);

    const customerMap = new Map();

    for (const item of detailed) {
      if (!customerMap.has(item.customer_id)) {
        customerMap.set(item.customer_id, {
          customer_id: item.customer_id,
          customer_name: item.customer_name,
          total_balance: 0,
          current: 0,
          bucket_1_30: 0,
          bucket_31_60: 0,
          bucket_61_90: 0,
          bucket_over_90: 0,
          invoices: [],
        });
      }

      const customer = customerMap.get(item.customer_id);
      customer.total_balance = round2(customer.total_balance + item.balance);
      customer.current = round2(customer.current + item.current);
      customer.bucket_1_30 = round2(customer.bucket_1_30 + item.bucket_1_30);
      customer.bucket_31_60 = round2(customer.bucket_31_60 + item.bucket_31_60);
      customer.bucket_61_90 = round2(customer.bucket_61_90 + item.bucket_61_90);
      customer.bucket_over_90 = round2(customer.bucket_over_90 + item.bucket_over_90);
      customer.invoices.push(item);
    }

    const customers = Array.from(customerMap.values());

    const summary = customers.reduce(
      (acc, customer) => {
        acc.total_customers += 1;
        acc.total_balance = round2(acc.total_balance + customer.total_balance);
        acc.current = round2(acc.current + customer.current);
        acc.bucket_1_30 = round2(acc.bucket_1_30 + customer.bucket_1_30);
        acc.bucket_31_60 = round2(acc.bucket_31_60 + customer.bucket_31_60);
        acc.bucket_61_90 = round2(acc.bucket_61_90 + customer.bucket_61_90);
        acc.bucket_over_90 = round2(acc.bucket_over_90 + customer.bucket_over_90);
        return acc;
      },
      {
        as_of_date: asOf,
        total_customers: 0,
        total_balance: 0,
        current: 0,
        bucket_1_30: 0,
        bucket_31_60: 0,
        bucket_61_90: 0,
        bucket_over_90: 0,
      }
    );

    res.json({
      summary,
      customers,
    });
  } catch (error) {
    console.error('Get AR aging report error:', error);
    res.status(500).json({ message: 'Failed to fetch AR aging report' });
  }
};

/* -------------------- CUSTOMER LEDGER -------------------- */

export const getCustomerLedger = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { customer_id = '', date_from = '', date_to = '' } = req.query;

    if (!customer_id) {
      return res.status(400).json({ message: 'customer_id is required' });
    }

    const [customerRows] = await db.query(
      `
      SELECT id, customer_code, name, contact_person, email, phone, address, status, company_id, branch_id, business_unit_id
      FROM customers
      WHERE id = ?
      `,
      [Number(customer_id)]
    );

    if (!customerRows.length) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const customer = customerRows[0];
    assertScopeMatch(customer, scope);

    let invoiceSql = `
      SELECT
        si.id,
        si.invoice_number AS document_number,
        si.invoice_date AS transaction_date,
        si.due_date,
        si.total_amount AS amount,
        si.status,
        'Invoice' AS transaction_type,
        si.remarks
      FROM sales_invoices si
      WHERE si.customer_id = ?
        AND si.status IN ('Posted', 'Partially Paid', 'Paid')
    `;
    const invoiceValues = [Number(customer_id)];

    if (date_from) {
      invoiceSql += ` AND si.invoice_date >= ?`;
      invoiceValues.push(date_from);
    }

    if (date_to) {
      invoiceSql += ` AND si.invoice_date <= ?`;
      invoiceValues.push(date_to);
    }

    const [invoiceRows] = await db.query(invoiceSql, invoiceValues);

    let paymentSql = `
      SELECT
        cp.id,
        cp.payment_number AS document_number,
        cp.payment_date AS transaction_date,
        cp.amount_paid AS amount,
        cp.payment_method,
        cp.reference_number,
        cp.remarks,
        si.invoice_number,
        'Payment' AS transaction_type
      FROM customer_payments cp
      INNER JOIN sales_invoices si
        ON cp.sales_invoice_id = si.id
      WHERE si.customer_id = ?
    `;
    const paymentValues = [Number(customer_id)];

    if (date_from) {
      paymentSql += ` AND cp.payment_date >= ?`;
      paymentValues.push(date_from);
    }

    if (date_to) {
      paymentSql += ` AND cp.payment_date <= ?`;
      paymentValues.push(date_to);
    }

    const [paymentRows] = await db.query(paymentSql, paymentValues);

    let creditMemoSql = `
      SELECT
        acm.id,
        acm.credit_memo_number AS document_number,
        acm.credit_date AS transaction_date,
        acm.total_amount AS amount,
        acm.remarks,
        si.invoice_number,
        sr.return_number,
        'Credit Memo' AS transaction_type
      FROM ar_credit_memos acm
      INNER JOIN sales_invoices si
        ON si.id = acm.sales_invoice_id
      INNER JOIN sales_returns sr
        ON sr.id = acm.sales_return_id
      WHERE acm.customer_id = ?
        AND acm.status = 'Posted'
    `;
    const creditMemoValues = [Number(customer_id)];

    if (date_from) {
      creditMemoSql += ` AND acm.credit_date >= ?`;
      creditMemoValues.push(date_from);
    }

    if (date_to) {
      creditMemoSql += ` AND acm.credit_date <= ?`;
      creditMemoValues.push(date_to);
    }

    const [creditMemoRows] = await db.query(creditMemoSql, creditMemoValues);

    let refundSql = `
      SELECT
        cr.id,
        cr.refund_number AS document_number,
        cr.refund_date AS transaction_date,
        cr.amount_refunded AS amount,
        cr.payment_method,
        cr.reference_number,
        cr.remarks,
        acm.credit_memo_number,
        si.invoice_number,
        'Refund' AS transaction_type
      FROM customer_refunds cr
      INNER JOIN ar_credit_memos acm
        ON acm.id = cr.ar_credit_memo_id
      INNER JOIN sales_invoices si
        ON si.id = cr.sales_invoice_id
      WHERE cr.customer_id = ?
        AND cr.status = 'Posted'
    `;
    const refundValues = [Number(customer_id)];

    if (date_from) {
      refundSql += ` AND cr.refund_date >= ?`;
      refundValues.push(date_from);
    }

    if (date_to) {
      refundSql += ` AND cr.refund_date <= ?`;
      refundValues.push(date_to);
    }

    const [refundRows] = await db.query(refundSql, refundValues);

    const transactions = [
      ...invoiceRows.map((row) => ({
        id: `INV-${row.id}`,
        transaction_date: row.transaction_date,
        transaction_type: row.transaction_type,
        document_number: row.document_number,
        reference_number: row.document_number,
        debit: round2(row.amount),
        credit: 0,
        remarks: row.remarks || '',
        due_date: row.due_date,
        status: row.status,
      })),
      ...paymentRows.map((row) => ({
        id: `PAY-${row.id}`,
        transaction_date: row.transaction_date,
        transaction_type: row.transaction_type,
        document_number: row.document_number,
        reference_number: row.reference_number || row.invoice_number,
        debit: 0,
        credit: round2(row.amount),
        remarks: row.remarks || '',
        due_date: null,
        status: row.payment_method,
      })),
      ...creditMemoRows.map((row) => ({
        id: `CM-${row.id}`,
        transaction_date: row.transaction_date,
        transaction_type: row.transaction_type,
        document_number: row.document_number,
        reference_number: row.return_number || row.invoice_number,
        debit: 0,
        credit: round2(row.amount),
        remarks: row.remarks || '',
        due_date: null,
        status: 'Posted',
      })),
      ...refundRows.map((row) => ({
        id: `RF-${row.id}`,
        transaction_date: row.transaction_date,
        transaction_type: row.transaction_type,
        document_number: row.document_number,
        reference_number: row.reference_number || row.credit_memo_number || row.invoice_number,
        debit: round2(row.amount),
        credit: 0,
        remarks: row.remarks || '',
        due_date: null,
        status: row.payment_method,
      })),
    ].sort((a, b) => {
      if (a.transaction_date === b.transaction_date) {
        return a.id.localeCompare(b.id);
      }
      return new Date(a.transaction_date) - new Date(b.transaction_date);
    });

    let runningBalance = 0;
    const items = transactions.map((item) => {
      runningBalance = round2(runningBalance + item.debit - item.credit);
      return {
        ...item,
        running_balance: runningBalance,
      };
    });

    const summary = items.reduce(
      (acc, item) => {
        acc.total_debit = round2(acc.total_debit + item.debit);
        acc.total_credit = round2(acc.total_credit + item.credit);
        return acc;
      },
      {
        total_debit: 0,
        total_credit: 0,
        closing_balance: runningBalance,
      }
    );

    res.json({
      customer,
      summary,
      items,
    });
  } catch (error) {
    console.error('Get customer ledger error:', error);
    res.status(500).json({ message: 'Failed to fetch customer ledger' });
  }
};
