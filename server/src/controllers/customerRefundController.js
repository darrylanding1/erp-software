import db from '../config/db.js';

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const getNextNumber = async (prefix, table, column, connection = db) => {
  const [rows] = await connection.query(
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

const getAccountByCode = async (accountCode, connection = db) => {
  const [rows] = await connection.query(
    `
    SELECT id, account_code, account_name
    FROM chart_of_accounts
    WHERE account_code = ?
    LIMIT 1
    `,
    [accountCode]
  );

  return rows[0] || null;
};

export const getRefundCandidates = async (req, res) => {
  try {
    const { customer_id = '', sales_invoice_id = '' } = req.query;

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
        si.invoice_number,
        si.invoice_date,
        si.total_amount AS invoice_total,
        c.name AS customer_name,
        COALESCE((
          SELECT SUM(cp.amount_paid)
          FROM customer_payments cp
          WHERE cp.sales_invoice_id = si.id
        ), 0) AS total_paid,
        COALESCE((
          SELECT SUM(cr.amount_refunded)
          FROM customer_refunds cr
          WHERE cr.ar_credit_memo_id = acm.id
            AND cr.status = 'Posted'
        ), 0) AS total_refunded
      FROM ar_credit_memos acm
      INNER JOIN sales_invoices si
        ON si.id = acm.sales_invoice_id
      INNER JOIN customers c
        ON c.id = acm.customer_id
      WHERE acm.status = 'Posted'
    `;
    const values = [];

    if (customer_id) {
      sql += ` AND acm.customer_id = ?`;
      values.push(Number(customer_id));
    }

    if (sales_invoice_id) {
      sql += ` AND acm.sales_invoice_id = ?`;
      values.push(Number(sales_invoice_id));
    }

    sql += ` ORDER BY acm.credit_date DESC, acm.id DESC`;

    const [rows] = await db.query(sql, values);

    const candidates = rows
      .map((row) => {
        const totalAmount = round2(row.total_amount);
        const totalPaid = round2(row.total_paid);
        const totalRefunded = round2(row.total_refunded);
        const invoiceTotal = round2(row.invoice_total);

        const overpaymentOrCredit = round2(totalPaid + totalAmount - invoiceTotal);
        const refundableAmount = round2(Math.min(totalAmount, Math.max(overpaymentOrCredit, 0)) - totalRefunded);

        return {
          ...row,
          total_amount: totalAmount,
          total_paid,
          total_refunded: totalRefunded,
          invoice_total: invoiceTotal,
          overpayment_or_credit: round2(Math.max(overpaymentOrCredit, 0)),
          refundable_amount: round2(Math.max(refundableAmount, 0)),
        };
      })
      .filter((row) => row.refundable_amount > 0);

    res.json(candidates);
  } catch (error) {
    console.error('Get refund candidates error:', error);
    res.status(500).json({ message: 'Failed to fetch refund candidates' });
  }
};

export const getCustomerRefunds = async (req, res) => {
  try {
    const {
      customer_id = '',
      sales_invoice_id = '',
      date_from = '',
      date_to = '',
      search = '',
    } = req.query;

    let sql = `
      SELECT
        cr.id,
        cr.refund_number,
        cr.ar_credit_memo_id,
        cr.sales_invoice_id,
        cr.customer_id,
        cr.refund_date,
        cr.payment_method,
        cr.reference_number,
        cr.status,
        cr.remarks,
        cr.amount_refunded,
        acm.credit_memo_number,
        si.invoice_number,
        c.name AS customer_name
      FROM customer_refunds cr
      INNER JOIN ar_credit_memos acm
        ON acm.id = cr.ar_credit_memo_id
      INNER JOIN sales_invoices si
        ON si.id = cr.sales_invoice_id
      INNER JOIN customers c
        ON c.id = cr.customer_id
      WHERE 1 = 1
    `;
    const values = [];

    if (customer_id) {
      sql += ` AND cr.customer_id = ?`;
      values.push(Number(customer_id));
    }

    if (sales_invoice_id) {
      sql += ` AND cr.sales_invoice_id = ?`;
      values.push(Number(sales_invoice_id));
    }

    if (date_from) {
      sql += ` AND cr.refund_date >= ?`;
      values.push(date_from);
    }

    if (date_to) {
      sql += ` AND cr.refund_date <= ?`;
      values.push(date_to);
    }

    if (search) {
      sql += `
        AND (
          cr.refund_number LIKE ?
          OR acm.credit_memo_number LIKE ?
          OR si.invoice_number LIKE ?
          OR c.name LIKE ?
          OR cr.reference_number LIKE ?
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

    sql += ` ORDER BY cr.refund_date DESC, cr.id DESC`;

    const [rows] = await db.query(sql, values);
    res.json(rows);
  } catch (error) {
    console.error('Get customer refunds error:', error);
    res.status(500).json({ message: 'Failed to fetch customer refunds' });
  }
};

export const createCustomerRefund = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      ar_credit_memo_id,
      refund_date,
      payment_method = 'Cash',
      reference_number = '',
      amount_refunded,
      remarks = '',
    } = req.body;

    const creditMemoId = Number(ar_credit_memo_id);
    const refundAmount = round2(amount_refunded);

    if (!creditMemoId || !refund_date || refundAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Credit memo, refund date, and valid refund amount are required',
      });
    }

    const [[creditMemo]] = await connection.query(
      `
      SELECT
        acm.id,
        acm.credit_memo_number,
        acm.sales_invoice_id,
        acm.customer_id,
        acm.credit_date,
        acm.total_amount,
        si.invoice_number,
        si.total_amount AS invoice_total,
        c.name AS customer_name,
        COALESCE((
          SELECT SUM(cp.amount_paid)
          FROM customer_payments cp
          WHERE cp.sales_invoice_id = si.id
        ), 0) AS total_paid,
        COALESCE((
          SELECT SUM(cr.amount_refunded)
          FROM customer_refunds cr
          WHERE cr.ar_credit_memo_id = acm.id
            AND cr.status = 'Posted'
        ), 0) AS total_refunded
      FROM ar_credit_memos acm
      INNER JOIN sales_invoices si
        ON si.id = acm.sales_invoice_id
      INNER JOIN customers c
        ON c.id = acm.customer_id
      WHERE acm.id = ?
        AND acm.status = 'Posted'
      LIMIT 1
      `,
      [creditMemoId]
    );

    if (!creditMemo) {
      await connection.rollback();
      return res.status(404).json({ message: 'Posted AR credit memo not found' });
    }

    const invoiceTotal = round2(creditMemo.invoice_total);
    const totalPaid = round2(creditMemo.total_paid);
    const totalCreditMemo = round2(creditMemo.total_amount);
    const totalRefunded = round2(creditMemo.total_refunded);

    const overpaymentOrCredit = round2(totalPaid + totalCreditMemo - invoiceTotal);
    const refundableAmount = round2(Math.min(totalCreditMemo, Math.max(overpaymentOrCredit, 0)) - totalRefunded);

    if (refundableAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({
        message: 'This credit memo has no refundable balance',
      });
    }

    if (refundAmount > refundableAmount) {
      await connection.rollback();
      return res.status(400).json({
        message: `Refund exceeds refundable balance of ${refundableAmount.toFixed(2)}`,
      });
    }

    const arAccount = await getAccountByCode('1100', connection);
    const cashAccount = await getAccountByCode('1000', connection);

    if (!arAccount || !cashAccount) {
      await connection.rollback();
      return res.status(400).json({
        message:
          'Required accounts are missing. Please ensure 1100 Accounts Receivable and 1000 Cash in Bank exist.',
      });
    }

    const refundNumber = await getNextNumber('RF', 'customer_refunds', 'refund_number', connection);

    const [refundResult] = await connection.query(
      `
      INSERT INTO customer_refunds
      (
        refund_number,
        ar_credit_memo_id,
        sales_invoice_id,
        customer_id,
        refund_date,
        payment_method,
        reference_number,
        status,
        remarks,
        amount_refunded
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Posted', ?, ?)
      `,
      [
        refundNumber,
        creditMemo.id,
        creditMemo.sales_invoice_id,
        creditMemo.customer_id,
        refund_date,
        payment_method,
        reference_number?.trim() || null,
        remarks?.trim() || null,
        refundAmount,
      ]
    );

    const entryNumber = await getNextNumber('JE', 'journal_entries', 'entry_number', connection);

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
      VALUES (?, ?, 'Customer Refund', ?, ?, ?, ?, 'Posted')
      `,
      [
        entryNumber,
        refund_date,
        refundResult.insertId,
        `Customer refund for ${refundNumber}`,
        refundAmount,
        refundAmount,
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
        `Clear customer credit for ${refundNumber}`,
        refundAmount,

        journalEntryId,
        cashAccount.id,
        cashAccount.account_code,
        cashAccount.account_name,
        `Cash out for ${refundNumber}`,
        refundAmount,
      ]
    );

    await connection.commit();

    const [rows] = await connection.query(
      `
      SELECT
        cr.*,
        acm.credit_memo_number,
        si.invoice_number,
        c.name AS customer_name
      FROM customer_refunds cr
      INNER JOIN ar_credit_memos acm
        ON acm.id = cr.ar_credit_memo_id
      INNER JOIN sales_invoices si
        ON si.id = cr.sales_invoice_id
      INNER JOIN customers c
        ON c.id = cr.customer_id
      WHERE cr.id = ?
      `,
      [refundResult.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    console.error('Create customer refund error:', error);
    res.status(500).json({ message: 'Failed to create customer refund' });
  } finally {
    connection.release();
  }
};