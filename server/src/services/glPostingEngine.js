import db from '../config/db.js';
import { ACCOUNT_CODES } from '../constants/accountCodes.js';

/**
 * Full GL Posting Engine
 * ---------------------------------------------------------
 * Centralized posting layer for:
 * - AP Invoice
 * - AP Payment
 * - Sales Invoice
 * - Sales Delivery (COGS)
 * - AR Payment
 * - AR Credit Memo
 * - Customer Refund
 * - Inventory Adjustment
 * - Generic Journal Entry
 * - Journal Reversal
 *
 * Notes:
 * - Built to match your current schema:
 *   journal_entries, journal_entry_lines, chart_of_accounts,
 *   accounting_periods, ap_invoices, ap_payments,
 *   sales_invoices, ar_payments, ar_credit_memos, customer_refunds,
 *   inventory_adjustments
 * - Uses accounting period lock validation
 * - Prevents duplicate posting per reference_type + reference_id
 * - Supports transactional usage by accepting an existing connection
 */

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const DEFAULT_CODES = {
  CASH: ACCOUNT_CODES?.CASH_IN_BANK || '1000',
  AR: ACCOUNT_CODES?.ACCOUNTS_RECEIVABLE || '1100',
  INVENTORY: ACCOUNT_CODES?.INVENTORY_ASSET || '1200',
  AP: ACCOUNT_CODES?.ACCOUNTS_PAYABLE || '2000',
  SALES: ACCOUNT_CODES?.SALES_REVENUE || '4000',
  SALES_RETURNS: ACCOUNT_CODES?.SALES_RETURNS_ALLOWANCES || '4010',
  COGS: ACCOUNT_CODES?.COST_OF_GOODS_SOLD || '5000',
};

const ADJUSTMENT_DEFAULTS = {
  INVENTORY_GAIN: '4100',   // Other Revenue
  INVENTORY_LOSS: '5000',   // COGS / inventory loss fallback
};

const isPositive = (value) => round2(value) > 0;

const cleanText = (value, fallback = null) => {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text ? text : fallback;
};

async function withOwnTransaction(work) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function runWithConnection(connection, work) {
  if (connection) {
    return work(connection);
  }
  return withOwnTransaction(work);
}

export async function getAccountByCode(connection, accountCode) {
  const [[row]] = await connection.query(
    `
    SELECT id, account_code, account_name, account_type, is_active
    FROM chart_of_accounts
    WHERE account_code = ?
      AND is_active = 1
    LIMIT 1
    `,
    [accountCode]
  );

  if (!row) {
    throw new Error(`Active GL account not found for code ${accountCode}`);
  }

  return row;
}

export async function getAccountsByCodes(connection, accountCodes = []) {
  const uniqueCodes = [...new Set((accountCodes || []).map((x) => String(x).trim()).filter(Boolean))];

  if (uniqueCodes.length === 0) return {};

  const [rows] = await connection.query(
    `
    SELECT id, account_code, account_name, account_type, is_active
    FROM chart_of_accounts
    WHERE account_code IN (?)
      AND is_active = 1
    `,
    [uniqueCodes]
  );

  const map = {};
  for (const row of rows) {
    map[row.account_code] = row;
  }

  for (const code of uniqueCodes) {
    if (!map[code]) {
      throw new Error(`Required active GL account not found for code ${code}`);
    }
  }

  return map;
}

export async function assertPostingDateOpen(connection, postingDate) {
  if (!postingDate) {
    throw new Error('Posting date is required');
  }

  const [[period]] = await connection.query(
    `
    SELECT id, period_code, status
    FROM accounting_periods
    WHERE ? BETWEEN start_date AND end_date
    LIMIT 1
    `,
    [postingDate]
  );

  if (!period) {
    throw new Error(`No accounting period found for posting date ${postingDate}`);
  }

  if (period.status === 'Hard Closed') {
    throw new Error(`Accounting period ${period.period_code} is hard closed`);
  }

  return period;
}

function normalizeJournalLines(lines = []) {
  const normalized = (lines || [])
    .map((line) => ({
      account_id: Number(line.account_id || 0),
      account_code: cleanText(line.account_code, ''),
      account_name: cleanText(line.account_name, ''),
      description: cleanText(line.description),
      debit: round2(line.debit || 0),
      credit: round2(line.credit || 0),
    }))
    .filter(
      (line) =>
        line.account_id > 0 &&
        line.account_code &&
        line.account_name &&
        (line.debit > 0 || line.credit > 0)
    );

  if (normalized.length < 2) {
    throw new Error('Journal entry must contain at least two valid lines');
  }

  for (const line of normalized) {
    if (line.debit > 0 && line.credit > 0) {
      throw new Error(
        `Journal line for ${line.account_code} cannot contain both debit and credit`
      );
    }
  }

  const totalDebit = round2(normalized.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round2(normalized.reduce((sum, line) => sum + line.credit, 0));

  if (totalDebit <= 0 || totalCredit <= 0 || totalDebit !== totalCredit) {
    throw new Error(
      `Journal entry is unbalanced. Debit=${totalDebit}, Credit=${totalCredit}`
    );
  }

  return {
    lines: normalized,
    totalDebit,
    totalCredit,
  };
}

async function getExistingPostedEntryByReference(connection, referenceType, referenceId) {
  if (!referenceType || !referenceId) return null;

  const [[row]] = await connection.query(
    `
    SELECT *
    FROM journal_entries
    WHERE reference_type = ?
      AND reference_id = ?
      AND status = 'Posted'
    ORDER BY id DESC
    LIMIT 1
    `,
    [referenceType, referenceId]
  );

  return row || null;
}

async function getJournalEntryWithLines(connection, journalEntryId) {
  const [[header]] = await connection.query(
    `
    SELECT *
    FROM journal_entries
    WHERE id = ?
    LIMIT 1
    `,
    [journalEntryId]
  );

  if (!header) {
    throw new Error('Journal entry not found');
  }

  const [lines] = await connection.query(
    `
    SELECT *
    FROM journal_entry_lines
    WHERE journal_entry_id = ?
    ORDER BY id ASC
    `,
    [journalEntryId]
  );

  return {
    ...header,
    lines,
  };
}

function buildEntryNumber(prefix = 'JE') {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
    String(now.getMilliseconds()).padStart(3, '0'),
  ];
  return `${prefix}-${parts.join('')}`;
}

export async function createJournalEntry(
  connection,
  {
    entryDate,
    referenceType = null,
    referenceId = null,
    memo = null,
    lines = [],
    status = 'Posted',
    allowDuplicateReference = false,
  }
) {
  await assertPostingDateOpen(connection, entryDate);

  if (!allowDuplicateReference && referenceType && referenceId) {
    const existing = await getExistingPostedEntryByReference(
      connection,
      referenceType,
      referenceId
    );

    if (existing) {
      throw new Error(
        `A posted journal entry already exists for ${referenceType} #${referenceId}`
      );
    }
  }

  const normalized = normalizeJournalLines(lines);

  const entryNumber = buildEntryNumber('JE');

  const [headerResult] = await connection.query(
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      entryNumber,
      entryDate,
      referenceType,
      referenceId,
      cleanText(memo),
      normalized.totalDebit,
      normalized.totalCredit,
      status,
    ]
  );

  for (const line of normalized.lines) {
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
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        headerResult.insertId,
        line.account_id,
        line.account_code,
        line.account_name,
        line.description,
        line.debit,
        line.credit,
      ]
    );
  }

  return getJournalEntryWithLines(connection, headerResult.insertId);
}

export async function reverseJournalEntry(
  connection,
  {
    journalEntryId = null,
    referenceType = null,
    referenceId = null,
    reversalDate,
    memo = null,
  }
) {
  if (!reversalDate) {
    throw new Error('Reversal date is required');
  }

  await assertPostingDateOpen(connection, reversalDate);

  let originalEntry = null;

  if (journalEntryId) {
    originalEntry = await getJournalEntryWithLines(connection, journalEntryId);
  } else if (referenceType && referenceId) {
    const existing = await getExistingPostedEntryByReference(
      connection,
      referenceType,
      referenceId
    );

    if (!existing) {
      throw new Error(`No posted journal entry found for ${referenceType} #${referenceId}`);
    }

    originalEntry = await getJournalEntryWithLines(connection, existing.id);
  } else {
    throw new Error('journalEntryId or referenceType/referenceId is required for reversal');
  }

  if (originalEntry.status !== 'Posted') {
    throw new Error('Only posted journal entries can be reversed');
  }

  const [[alreadyReversed]] = await connection.query(
    `
    SELECT id
    FROM journal_entries
    WHERE reversal_of_entry_id = ?
    LIMIT 1
    `,
    [originalEntry.id]
  );

  if (alreadyReversed) {
    throw new Error(`Journal entry ${originalEntry.entry_number} is already reversed`);
  }

  const reversedLines = originalEntry.lines.map((line) => ({
    account_id: line.account_id,
    account_code: line.account_code,
    account_name: line.account_name,
    description: line.description
      ? `Reversal - ${line.description}`
      : `Reversal of ${originalEntry.entry_number}`,
    debit: line.credit,
    credit: line.debit,
  }));

  const reversal = await createJournalEntry(connection, {
    entryDate: reversalDate,
    referenceType: originalEntry.reference_type
      ? `${originalEntry.reference_type} Reversal`
      : 'Journal Reversal',
    referenceId: originalEntry.reference_id,
    memo:
      cleanText(memo) ||
      `Reversal of ${originalEntry.entry_number}${originalEntry.memo ? ` - ${originalEntry.memo}` : ''}`,
    lines: reversedLines,
    allowDuplicateReference: true,
  });

  await connection.query(
    `
    UPDATE journal_entries
    SET reversed_entry_id = ?
    WHERE id = ?
    `,
    [reversal.id, originalEntry.id]
  );

  await connection.query(
    `
    UPDATE journal_entries
    SET reversal_of_entry_id = ?
    WHERE id = ?
    `,
    [originalEntry.id, reversal.id]
  );

  return {
    original_entry_id: originalEntry.id,
    reversal_entry_id: reversal.id,
    reversal_entry_number: reversal.entry_number,
  };
}

export async function getJournalByReference(
  referenceType,
  referenceId,
  connection = null
) {
  return runWithConnection(connection, async (conn) => {
    const [[entry]] = await conn.query(
      `
      SELECT *
      FROM journal_entries
      WHERE reference_type = ?
        AND reference_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [referenceType, referenceId]
    );

    if (!entry) return null;

    return getJournalEntryWithLines(conn, entry.id);
  });
}

/**
 * Generic helper for module postings.
 */
async function postStandardDoubleEntry(
  connection,
  {
    entryDate,
    referenceType,
    referenceId,
    memo,
    debitCode,
    creditCode,
    amount,
    debitDescription,
    creditDescription,
    allowDuplicateReference = false,
  }
) {
  const value = round2(amount);

  if (!isPositive(value)) {
    throw new Error(`${referenceType}: posting amount must be greater than zero`);
  }

  const accounts = await getAccountsByCodes(connection, [debitCode, creditCode]);

  return createJournalEntry(connection, {
    entryDate,
    referenceType,
    referenceId,
    memo,
    allowDuplicateReference,
    lines: [
      {
        account_id: accounts[debitCode].id,
        account_code: accounts[debitCode].account_code,
        account_name: accounts[debitCode].account_name,
        description: debitDescription,
        debit: value,
        credit: 0,
      },
      {
        account_id: accounts[creditCode].id,
        account_code: accounts[creditCode].account_code,
        account_name: accounts[creditCode].account_name,
        description: creditDescription,
        debit: 0,
        credit: value,
      },
    ],
  });
}

/**
 * AP Invoice
 * Dr Inventory
 * Cr Accounts Payable
 */
export async function postApInvoiceGL(
  { apInvoiceId, connection = null }
) {
  return runWithConnection(connection, async (conn) => {
    const [[invoice]] = await conn.query(
      `
      SELECT id, invoice_number, invoice_date, total_amount, status
      FROM ap_invoices
      WHERE id = ?
      LIMIT 1
      `,
      [apInvoiceId]
    );

    if (!invoice) throw new Error('AP invoice not found');
    if (invoice.status === 'Cancelled') throw new Error('Cancelled AP invoice cannot be posted');

    return postStandardDoubleEntry(conn, {
      entryDate: invoice.invoice_date,
      referenceType: 'AP Invoice',
      referenceId: invoice.id,
      memo: `AP invoice ${invoice.invoice_number}`,
      debitCode: DEFAULT_CODES.INVENTORY,
      creditCode: DEFAULT_CODES.AP,
      amount: invoice.total_amount,
      debitDescription: `Inventory recognized for ${invoice.invoice_number}`,
      creditDescription: `Accounts payable for ${invoice.invoice_number}`,
    });
  });
}

/**
 * AP Payment
 * Dr Accounts Payable
 * Cr Cash
 */
export async function postApPaymentGL(
  { apPaymentId, connection = null }
) {
  return runWithConnection(connection, async (conn) => {
    const [[payment]] = await conn.query(
      `
      SELECT p.id, p.payment_number, p.payment_date, p.amount_paid, p.status, i.invoice_number
      FROM ap_payments p
      INNER JOIN ap_invoices i ON i.id = p.ap_invoice_id
      WHERE p.id = ?
      LIMIT 1
      `,
      [apPaymentId]
    );

    if (!payment) throw new Error('AP payment not found');
    if (payment.status === 'Cancelled') throw new Error('Cancelled AP payment cannot be posted');

    return postStandardDoubleEntry(conn, {
      entryDate: payment.payment_date,
      referenceType: 'AP Payment',
      referenceId: payment.id,
      memo: `AP payment ${payment.payment_number} for ${payment.invoice_number}`,
      debitCode: DEFAULT_CODES.AP,
      creditCode: DEFAULT_CODES.CASH,
      amount: payment.amount_paid,
      debitDescription: `Settlement of ${payment.invoice_number}`,
      creditDescription: `Cash disbursement ${payment.payment_number}`,
    });
  });
}

/**
 * Sales Invoice
 * Dr Accounts Receivable
 * Cr Sales Revenue
 */
export async function postSalesInvoiceGL(
  { salesInvoiceId, connection = null }
) {
  return runWithConnection(connection, async (conn) => {
    const [[invoice]] = await conn.query(
      `
      SELECT id, invoice_number, invoice_date, total_amount, status
      FROM sales_invoices
      WHERE id = ?
      LIMIT 1
      `,
      [salesInvoiceId]
    );

    if (!invoice) throw new Error('Sales invoice not found');
    if (invoice.status === 'Cancelled') throw new Error('Cancelled sales invoice cannot be posted');

    return postStandardDoubleEntry(conn, {
      entryDate: invoice.invoice_date,
      referenceType: 'Sales Invoice',
      referenceId: invoice.id,
      memo: `Sales invoice ${invoice.invoice_number}`,
      debitCode: DEFAULT_CODES.AR,
      creditCode: DEFAULT_CODES.SALES,
      amount: invoice.total_amount,
      debitDescription: `Receivable for ${invoice.invoice_number}`,
      creditDescription: `Revenue for ${invoice.invoice_number}`,
    });
  });
}

/**
 * Sales Delivery / COGS posting
 * Dr COGS
 * Cr Inventory
 *
 * totalCogs may come from inventory ledger or be passed directly.
 */
export async function postSalesDeliveryGL(
  { salesDeliveryId, totalCogs = null, connection = null }
) {
  return runWithConnection(connection, async (conn) => {
    const [[delivery]] = await conn.query(
      `
      SELECT id, delivery_number, delivery_date, status
      FROM sales_deliveries
      WHERE id = ?
      LIMIT 1
      `,
      [salesDeliveryId]
    );

    if (!delivery) throw new Error('Sales delivery not found');
    if (delivery.status === 'Cancelled') throw new Error('Cancelled sales delivery cannot be posted');

    let resolvedCogs = round2(totalCogs || 0);

    if (!isPositive(resolvedCogs)) {
      const [[ledgerTotals]] = await conn.query(
        `
        SELECT COALESCE(SUM(line_total), 0) AS total_cogs
        FROM inventory_ledger
        WHERE reference_type = 'SalesDelivery'
          AND reference_id = ?
          AND movement_type = 'ISSUE'
        `,
        [salesDeliveryId]
      );

      resolvedCogs = round2(ledgerTotals?.total_cogs || 0);
    }

    return postStandardDoubleEntry(conn, {
      entryDate: delivery.delivery_date,
      referenceType: 'SalesDelivery',
      referenceId: delivery.id,
      memo: `COGS posting for sales delivery ${delivery.delivery_number}`,
      debitCode: DEFAULT_CODES.COGS,
      creditCode: DEFAULT_CODES.INVENTORY,
      amount: resolvedCogs,
      debitDescription: `Cost of goods sold - ${delivery.delivery_number}`,
      creditDescription: `Inventory reduction - ${delivery.delivery_number}`,
    });
  });
}

/**
 * AR Payment
 * Dr Cash
 * Cr Accounts Receivable
 */
export async function postArPaymentGL(
  { arPaymentId, connection = null }
) {
  return runWithConnection(connection, async (conn) => {
    const [[payment]] = await conn.query(
      `
      SELECT p.id, p.payment_number, p.payment_date, p.amount_paid, p.status, i.invoice_number
      FROM ar_payments p
      INNER JOIN sales_invoices i ON i.id = p.sales_invoice_id
      WHERE p.id = ?
      LIMIT 1
      `,
      [arPaymentId]
    );

    if (!payment) throw new Error('AR payment not found');
    if (payment.status === 'Cancelled') throw new Error('Cancelled AR payment cannot be posted');

    return postStandardDoubleEntry(conn, {
      entryDate: payment.payment_date,
      referenceType: 'AR Payment',
      referenceId: payment.id,
      memo: `AR payment ${payment.payment_number} for ${payment.invoice_number}`,
      debitCode: DEFAULT_CODES.CASH,
      creditCode: DEFAULT_CODES.AR,
      amount: payment.amount_paid,
      debitDescription: `Cash received - ${payment.payment_number}`,
      creditDescription: `Receivable settlement - ${payment.invoice_number}`,
    });
  });
}

/**
 * AR Credit Memo
 * Dr Sales Returns and Allowances
 * Cr Accounts Receivable
 */
export async function postArCreditMemoGL(
  { arCreditMemoId, connection = null }
) {
  return runWithConnection(connection, async (conn) => {
    const [[memoRow]] = await conn.query(
      `
      SELECT id, credit_memo_number, credit_date, total_amount, status
      FROM ar_credit_memos
      WHERE id = ?
      LIMIT 1
      `,
      [arCreditMemoId]
    );

    if (!memoRow) throw new Error('AR credit memo not found');
    if (memoRow.status === 'Cancelled') throw new Error('Cancelled AR credit memo cannot be posted');

    return postStandardDoubleEntry(conn, {
      entryDate: memoRow.credit_date,
      referenceType: 'AR Credit Memo',
      referenceId: memoRow.id,
      memo: `AR credit memo ${memoRow.credit_memo_number}`,
      debitCode: DEFAULT_CODES.SALES_RETURNS,
      creditCode: DEFAULT_CODES.AR,
      amount: memoRow.total_amount,
      debitDescription: `Sales returns - ${memoRow.credit_memo_number}`,
      creditDescription: `Reduce receivable - ${memoRow.credit_memo_number}`,
    });
  });
}

/**
 * Customer Refund
 * Dr Accounts Receivable (reverse credit balance / apply refund clearing)
 * Cr Cash
 *
 * If you prefer a dedicated refund clearing liability later,
 * swap DEFAULT_CODES.AR with that account code.
 */
export async function postCustomerRefundGL(
  { customerRefundId, debitAccountCode = DEFAULT_CODES.AR, connection = null }
) {
  return runWithConnection(connection, async (conn) => {
    const [[refund]] = await conn.query(
      `
      SELECT id, refund_number, refund_date, amount_refunded, status
      FROM customer_refunds
      WHERE id = ?
      LIMIT 1
      `,
      [customerRefundId]
    );

    if (!refund) throw new Error('Customer refund not found');
    if (refund.status === 'Cancelled') throw new Error('Cancelled customer refund cannot be posted');

    return postStandardDoubleEntry(conn, {
      entryDate: refund.refund_date,
      referenceType: 'Customer Refund',
      referenceId: refund.id,
      memo: `Customer refund ${refund.refund_number}`,
      debitCode: debitAccountCode,
      creditCode: DEFAULT_CODES.CASH,
      amount: refund.amount_refunded,
      debitDescription: `Refund settlement - ${refund.refund_number}`,
      creditDescription: `Cash out - ${refund.refund_number}`,
    });
  });
}

/**
 * Inventory Adjustment
 * Positive variance:
 *   Dr Inventory
 *   Cr Inventory Gain / Other Revenue
 *
 * Negative variance:
 *   Dr Inventory Loss / COGS
 *   Cr Inventory
 */
export async function postInventoryAdjustmentGL(
  {
    inventoryAdjustmentId,
    gainAccountCode = ADJUSTMENT_DEFAULTS.INVENTORY_GAIN,
    lossAccountCode = ADJUSTMENT_DEFAULTS.INVENTORY_LOSS,
    connection = null,
  }
) {
  return runWithConnection(connection, async (conn) => {
    const [[adjustment]] = await conn.query(
      `
      SELECT id, adjustment_number, adjustment_date, total_value_variance, status
      FROM inventory_adjustments
      WHERE id = ?
      LIMIT 1
      `,
      [inventoryAdjustmentId]
    );

    if (!adjustment) throw new Error('Inventory adjustment not found');
    if (adjustment.status === 'Cancelled') {
      throw new Error('Cancelled inventory adjustment cannot be posted');
    }

    const variance = round2(adjustment.total_value_variance || 0);

    if (!isPositive(Math.abs(variance))) {
      throw new Error('Inventory adjustment has zero value variance');
    }

    if (variance > 0) {
      return postStandardDoubleEntry(conn, {
        entryDate: adjustment.adjustment_date,
        referenceType: 'Inventory Adjustment',
        referenceId: adjustment.id,
        memo: `Inventory gain adjustment ${adjustment.adjustment_number}`,
        debitCode: DEFAULT_CODES.INVENTORY,
        creditCode: gainAccountCode,
        amount: variance,
        debitDescription: `Inventory increase - ${adjustment.adjustment_number}`,
        creditDescription: `Inventory gain - ${adjustment.adjustment_number}`,
      });
    }

    return postStandardDoubleEntry(conn, {
      entryDate: adjustment.adjustment_date,
      referenceType: 'Inventory Adjustment',
      referenceId: adjustment.id,
      memo: `Inventory loss adjustment ${adjustment.adjustment_number}`,
      debitCode: lossAccountCode,
      creditCode: DEFAULT_CODES.INVENTORY,
      amount: Math.abs(variance),
      debitDescription: `Inventory loss - ${adjustment.adjustment_number}`,
      creditDescription: `Inventory decrease - ${adjustment.adjustment_number}`,
    });
  });
}

/**
 * Generic custom posting entry point.
 */
export async function postCustomGL(
  {
    entryDate,
    referenceType = null,
    referenceId = null,
    memo = null,
    lines = [],
    allowDuplicateReference = false,
    connection = null,
  }
) {
  return runWithConnection(connection, async (conn) =>
    createJournalEntry(conn, {
      entryDate,
      referenceType,
      referenceId,
      memo,
      lines,
      allowDuplicateReference,
    })
  );
}

/**
 * Auto-router if you want one service call only.
 */
export async function postDocumentGL(
  {
    module,
    id,
    options = {},
    connection = null,
  }
) {
  const key = String(module || '').trim().toUpperCase();

  switch (key) {
    case 'AP_INVOICE':
      return postApInvoiceGL({ apInvoiceId: id, connection });
    case 'AP_PAYMENT':
      return postApPaymentGL({ apPaymentId: id, connection });
    case 'SALES_INVOICE':
      return postSalesInvoiceGL({ salesInvoiceId: id, connection });
    case 'SALES_DELIVERY':
      return postSalesDeliveryGL({
        salesDeliveryId: id,
        totalCogs: options.totalCogs,
        connection,
      });
    case 'AR_PAYMENT':
      return postArPaymentGL({ arPaymentId: id, connection });
    case 'AR_CREDIT_MEMO':
      return postArCreditMemoGL({ arCreditMemoId: id, connection });
    case 'CUSTOMER_REFUND':
      return postCustomerRefundGL({
        customerRefundId: id,
        debitAccountCode: options.debitAccountCode || DEFAULT_CODES.AR,
        connection,
      });
    case 'INVENTORY_ADJUSTMENT':
      return postInventoryAdjustmentGL({
        inventoryAdjustmentId: id,
        gainAccountCode: options.gainAccountCode,
        lossAccountCode: options.lossAccountCode,
        connection,
      });
    default:
      throw new Error(`Unsupported GL posting module: ${module}`);
  }
}

export async function reverseDocumentGL(
  {
    referenceType,
    referenceId,
    reversalDate,
    memo = null,
    connection = null,
  }
) {
  return runWithConnection(connection, async (conn) =>
    reverseJournalEntry(conn, {
      referenceType,
      referenceId,
      reversalDate,
      memo,
    })
  );
}

export default {
  getAccountByCode,
  getAccountsByCodes,
  assertPostingDateOpen,
  createJournalEntry,
  reverseJournalEntry,
  getJournalByReference,
  postCustomGL,
  postDocumentGL,
  reverseDocumentGL,
  postApInvoiceGL,
  postApPaymentGL,
  postSalesInvoiceGL,
  postSalesDeliveryGL,
  postArPaymentGL,
  postArCreditMemoGL,
  postCustomerRefundGL,
  postInventoryAdjustmentGL,
};