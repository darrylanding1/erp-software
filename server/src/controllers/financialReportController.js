import db from '../config/db.js';
import { buildScopeWhereClause, requireDataScope } from '../middleware/dataScopeMiddleware.js';

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const today = () => new Date().toISOString().split('T')[0];

const moneyObject = (rows = []) =>
  rows.map((row) => {
    const next = { ...row };
    Object.keys(next).forEach((key) => {
      if (
        key.includes('amount') ||
        key.includes('balance') ||
        key.includes('debit') ||
        key.includes('credit') ||
        key.includes('current') ||
        key.includes('bucket_') ||
        key.includes('income') ||
        key.includes('expense') ||
        key.includes('revenue')
      ) {
        next[key] = round2(next[key]);
      }
    });
    return next;
  });

const buildNaturalBalance = (accountType, debit, credit) => {
  const d = toNumber(debit);
  const c = toNumber(credit);

  if (accountType === 'Asset' || accountType === 'Expense') {
    return round2(d - c);
  }

  return round2(c - d);
};

const buildDebitCreditColumns = (signedAmount) => {
  const value = round2(signedAmount);

  if (value >= 0) {
    return {
      debit: value,
      credit: 0,
    };
  }

  return {
    debit: 0,
    credit: round2(Math.abs(value)),
  };
};

export const getFinancialReportMeta = async (req, res) => {
  try {
    const scope = requireDataScope(req);

    const customerScope = buildScopeWhereClause(scope, {
      company: 'c.company_id',
      branch: 'c.branch_id',
      businessUnit: 'c.business_unit_id',
    });

    const supplierScope = buildScopeWhereClause(scope, {
      company: 's.company_id',
      branch: 's.branch_id',
      businessUnit: 's.business_unit_id',
    });

    const [accounts] = await db.query(
      `
      SELECT
        id,
        account_code,
        account_name,
        account_type
      FROM chart_of_accounts
      WHERE is_active = 1
      ORDER BY account_code ASC
      `
    );

    const [customers] = await db.query(
      `
      SELECT
        id,
        customer_code,
        name
      FROM customers c
      WHERE c.status = 'Active' ${customerScope.sql}
      ORDER BY name ASC
      `,
      customerScope.values
    );

    const [suppliers] = await db.query(
      `
      SELECT
        id,
        name
      FROM suppliers s
      WHERE s.status = 'Active' ${supplierScope.sql}
      ORDER BY name ASC
      `,
      supplierScope.values
    );

    res.json({
      accounts,
      customers,
      suppliers,
    });
  } catch (error) {
    console.error('Get financial report meta error:', error);
    res.status(500).json({ message: 'Failed to fetch financial report metadata' });
  }
};

export const getTrialBalance = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      date_from = '',
      date_to = '',
      account_type = '',
      account_id = '',
      include_zero = 'false',
    } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({
        message: 'date_from and date_to are required',
      });
    }

    const jeScope = buildScopeWhereClause(scope, {
      company: 'je.company_id',
      branch: 'je.branch_id',
      businessUnit: 'je.business_unit_id',
    });

    const accountFilterSql = [];
    const accountFilterValues = [];

    if (account_type) {
      accountFilterSql.push(`coa.account_type = ?`);
      accountFilterValues.push(account_type);
    }

    if (account_id) {
      accountFilterSql.push(`coa.id = ?`);
      accountFilterValues.push(Number(account_id));
    }

    const accountWhere =
      accountFilterSql.length > 0 ? `AND ${accountFilterSql.join(' AND ')}` : '';

    const sql = `
      SELECT
        coa.id,
        coa.account_code,
        coa.account_name,
        coa.account_type,

        COALESCE(opening.opening_debit, 0) AS opening_debit,
        COALESCE(opening.opening_credit, 0) AS opening_credit,

        COALESCE(period.period_debit, 0) AS period_debit,
        COALESCE(period.period_credit, 0) AS period_credit

      FROM chart_of_accounts coa

      LEFT JOIN (
        SELECT
          jel.account_id,
          SUM(jel.debit) AS opening_debit,
          SUM(jel.credit) AS opening_credit
        FROM journal_entry_lines jel
        INNER JOIN journal_entries je
          ON je.id = jel.journal_entry_id
        WHERE je.status = 'Posted'
          AND je.entry_date < ?
          ${jeScope.sql}
        GROUP BY jel.account_id
      ) opening
        ON opening.account_id = coa.id

      LEFT JOIN (
        SELECT
          jel.account_id,
          SUM(jel.debit) AS period_debit,
          SUM(jel.credit) AS period_credit
        FROM journal_entry_lines jel
        INNER JOIN journal_entries je
          ON je.id = jel.journal_entry_id
        WHERE je.status = 'Posted'
          AND je.entry_date BETWEEN ? AND ?
          ${jeScope.sql}
        GROUP BY jel.account_id
      ) period
        ON period.account_id = coa.id

      WHERE coa.is_active = 1
      ${accountWhere}
      ORDER BY coa.account_code ASC
    `;

    const values = [
      date_from,
      ...jeScope.values,
      date_from,
      date_to,
      ...jeScope.values,
      ...accountFilterValues,
    ];

    const [rows] = await db.query(sql, values);

    let items = rows.map((row) => {
      const openingSigned =
        toNumber(row.opening_debit) - toNumber(row.opening_credit);
      const endingSigned =
        openingSigned +
        toNumber(row.period_debit) -
        toNumber(row.period_credit);

      const openingCols = buildDebitCreditColumns(openingSigned);
      const endingCols = buildDebitCreditColumns(endingSigned);

      return {
        id: row.id,
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        opening_debit: round2(openingCols.debit),
        opening_credit: round2(openingCols.credit),
        period_debit: round2(row.period_debit),
        period_credit: round2(row.period_credit),
        ending_debit: round2(endingCols.debit),
        ending_credit: round2(endingCols.credit),
      };
    });

    if (include_zero !== 'true') {
      items = items.filter((item) => {
        return (
          item.opening_debit !== 0 ||
          item.opening_credit !== 0 ||
          item.period_debit !== 0 ||
          item.period_credit !== 0 ||
          item.ending_debit !== 0 ||
          item.ending_credit !== 0
        );
      });
    }

    const summary = items.reduce(
      (acc, item) => {
        acc.opening_debit += item.opening_debit;
        acc.opening_credit += item.opening_credit;
        acc.period_debit += item.period_debit;
        acc.period_credit += item.period_credit;
        acc.ending_debit += item.ending_debit;
        acc.ending_credit += item.ending_credit;
        return acc;
      },
      {
        date_from,
        date_to,
        opening_debit: 0,
        opening_credit: 0,
        period_debit: 0,
        period_credit: 0,
        ending_debit: 0,
        ending_credit: 0,
      }
    );

    Object.keys(summary).forEach((key) => {
      if (key !== 'date_from' && key !== 'date_to') {
        summary[key] = round2(summary[key]);
      }
    });

    res.json({
      summary,
      items,
    });
  } catch (error) {
    console.error('Get trial balance error:', error);
    res.status(500).json({ message: 'Failed to fetch trial balance' });
  }
};

export const getGeneralLedger = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      account_id = '',
      date_from = '',
      date_to = '',
    } = req.query;

    if (!account_id) {
      return res.status(400).json({ message: 'account_id is required' });
    }

    if (!date_from || !date_to) {
      return res.status(400).json({
        message: 'date_from and date_to are required',
      });
    }

    const jeScope = buildScopeWhereClause(scope, {
      company: 'je.company_id',
      branch: 'je.branch_id',
      businessUnit: 'je.business_unit_id',
    });

    const [[account]] = await db.query(
      `
      SELECT
        id,
        account_code,
        account_name,
        account_type
      FROM chart_of_accounts
      WHERE id = ?
      LIMIT 1
      `,
      [Number(account_id)]
    );

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const [[openingRow]] = await db.query(
      `
      SELECT
        COALESCE(SUM(jel.debit), 0) AS opening_debit,
        COALESCE(SUM(jel.credit), 0) AS opening_credit
      FROM journal_entry_lines jel
      INNER JOIN journal_entries je
        ON je.id = jel.journal_entry_id
      WHERE je.status = 'Posted'
        AND jel.account_id = ?
        AND je.entry_date < ?
        ${jeScope.sql}
      `,
      [Number(account_id), date_from, ...jeScope.values]
    );

    const [rows] = await db.query(
      `
      SELECT
        je.id AS journal_entry_id,
        je.entry_number,
        je.entry_date,
        je.reference_type,
        je.reference_id,
        je.memo,
        jel.id AS journal_entry_line_id,
        jel.description,
        jel.debit,
        jel.credit
      FROM journal_entry_lines jel
      INNER JOIN journal_entries je
        ON je.id = jel.journal_entry_id
      WHERE je.status = 'Posted'
        AND jel.account_id = ?
        AND je.entry_date BETWEEN ? AND ?
        ${jeScope.sql}
      ORDER BY je.entry_date ASC, je.id ASC, jel.id ASC
      `,
      [Number(account_id), date_from, date_to, ...jeScope.values]
    );

    const openingSigned = buildNaturalBalance(
      account.account_type,
      openingRow.opening_debit,
      openingRow.opening_credit
    );

    let runningBalance = openingSigned;

    const items = rows.map((row) => {
      const movement = buildNaturalBalance(
        account.account_type,
        row.debit,
        row.credit
      );

      runningBalance = round2(runningBalance + movement);

      return {
        journal_entry_id: row.journal_entry_id,
        journal_entry_line_id: row.journal_entry_line_id,
        entry_number: row.entry_number,
        entry_date: row.entry_date,
        reference_type: row.reference_type,
        reference_id: row.reference_id,
        memo: row.memo,
        description: row.description,
        debit: round2(row.debit),
        credit: round2(row.credit),
        movement: round2(movement),
        running_balance: round2(runningBalance),
      };
    });

    const summary = {
      date_from,
      date_to,
      opening_balance: round2(openingSigned),
      total_debit: round2(rows.reduce((sum, row) => sum + toNumber(row.debit), 0)),
      total_credit: round2(rows.reduce((sum, row) => sum + toNumber(row.credit), 0)),
      closing_balance: round2(runningBalance),
    };

    res.json({
      account,
      summary,
      items,
    });
  } catch (error) {
    console.error('Get general ledger error:', error);
    res.status(500).json({ message: 'Failed to fetch general ledger' });
  }
};

export const getBalanceSheet = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { as_of_date = today() } = req.query;

    const jeScope = buildScopeWhereClause(scope, {
      company: 'je.company_id',
      branch: 'je.branch_id',
      businessUnit: 'je.business_unit_id',
    });

    const [rows] = await db.query(
      `
      SELECT
        coa.id,
        coa.account_code,
        coa.account_name,
        coa.account_type,
        COALESCE(SUM(jel.debit), 0) AS total_debit,
        COALESCE(SUM(jel.credit), 0) AS total_credit
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel
        ON jel.account_id = coa.id
      LEFT JOIN journal_entries je
        ON je.id = jel.journal_entry_id
        AND je.status = 'Posted'
        AND je.entry_date <= ?
        ${jeScope.sql}
      WHERE coa.is_active = 1
        AND coa.account_type IN ('Asset', 'Liability', 'Equity')
      GROUP BY
        coa.id,
        coa.account_code,
        coa.account_name,
        coa.account_type
      ORDER BY coa.account_code ASC
      `,
      [as_of_date, ...jeScope.values]
    );

    const assets = [];
    const liabilities = [];
    const equity = [];

    for (const row of rows) {
      const amount = buildNaturalBalance(
        row.account_type,
        row.total_debit,
        row.total_credit
      );

      if (amount === 0) continue;

      const item = {
        id: row.id,
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        amount: round2(amount),
      };

      if (row.account_type === 'Asset') assets.push(item);
      if (row.account_type === 'Liability') liabilities.push(item);
      if (row.account_type === 'Equity') equity.push(item);
    }

    const totalAssets = round2(
      assets.reduce((sum, item) => sum + toNumber(item.amount), 0)
    );
    const totalLiabilities = round2(
      liabilities.reduce((sum, item) => sum + toNumber(item.amount), 0)
    );
    const totalEquity = round2(
      equity.reduce((sum, item) => sum + toNumber(item.amount), 0)
    );
    const totalLiabilitiesAndEquity = round2(totalLiabilities + totalEquity);

    res.json({
      as_of_date,
      assets,
      liabilities,
      equity,
      summary: {
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        total_equity: totalEquity,
        total_liabilities_and_equity: totalLiabilitiesAndEquity,
        balanced: totalAssets === totalLiabilitiesAndEquity,
        difference: round2(totalAssets - totalLiabilitiesAndEquity),
      },
    });
  } catch (error) {
    console.error('Get balance sheet error:', error);
    res.status(500).json({ message: 'Failed to fetch balance sheet' });
  }
};

export const getProfitAndLoss = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      date_from = '',
      date_to = '',
    } = req.query;

    if (!date_from || !date_to) {
      return res.status(400).json({
        message: 'date_from and date_to are required',
      });
    }

    const jeScope = buildScopeWhereClause(scope, {
      company: 'je.company_id',
      branch: 'je.branch_id',
      businessUnit: 'je.business_unit_id',
    });

    const [rows] = await db.query(
      `
      SELECT
        coa.id,
        coa.account_code,
        coa.account_name,
        coa.account_type,
        COALESCE(SUM(jel.debit), 0) AS total_debit,
        COALESCE(SUM(jel.credit), 0) AS total_credit
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel
        ON jel.account_id = coa.id
      LEFT JOIN journal_entries je
        ON je.id = jel.journal_entry_id
        AND je.status = 'Posted'
        AND je.entry_date BETWEEN ? AND ?
        ${jeScope.sql}
      WHERE coa.is_active = 1
        AND coa.account_type IN ('Revenue', 'Expense')
      GROUP BY
        coa.id,
        coa.account_code,
        coa.account_name,
        coa.account_type
      ORDER BY coa.account_code ASC
      `,
      [date_from, date_to, ...jeScope.values]
    );

    const revenues = [];
    const expenses = [];

    for (const row of rows) {
      let amount = 0;

      if (row.account_type === 'Revenue') {
        amount = round2(toNumber(row.total_credit) - toNumber(row.total_debit));
      } else {
        amount = round2(toNumber(row.total_debit) - toNumber(row.total_credit));
      }

      if (amount === 0) continue;

      const item = {
        id: row.id,
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        amount,
      };

      if (row.account_type === 'Revenue') revenues.push(item);
      if (row.account_type === 'Expense') expenses.push(item);
    }

    const totalRevenue = round2(
      revenues.reduce((sum, item) => sum + toNumber(item.amount), 0)
    );
    const totalExpense = round2(
      expenses.reduce((sum, item) => sum + toNumber(item.amount), 0)
    );
    const netIncome = round2(totalRevenue - totalExpense);

    res.json({
      date_from,
      date_to,
      revenues,
      expenses,
      summary: {
        total_revenue: totalRevenue,
        total_expense: totalExpense,
        net_income: netIncome,
      },
    });
  } catch (error) {
    console.error('Get profit and loss error:', error);
    res.status(500).json({ message: 'Failed to fetch profit and loss' });
  }
};

export const getArAgingReport = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      customer_id = '',
      as_of_date = today(),
    } = req.query;

    let sql = `
      SELECT
        si.id,
        si.invoice_number,
        si.invoice_date,
        si.due_date,
        si.status,
        si.total_amount,
        si.customer_id,
        c.name AS customer_name,

        COALESCE((
          SELECT SUM(ap.amount_paid)
          FROM ar_payments ap
          WHERE ap.sales_invoice_id = si.id
            AND ap.status = 'Posted'
            AND ap.payment_date <= ?
        ), 0) AS total_paid,

        COALESCE((
          SELECT SUM(acm.total_amount)
          FROM ar_credit_memos acm
          WHERE acm.sales_invoice_id = si.id
            AND acm.status = 'Posted'
            AND acm.credit_date <= ?
        ), 0) AS total_credited

      FROM sales_invoices si
      INNER JOIN customers c
        ON c.id = si.customer_id
      WHERE si.status IN ('Posted', 'Partially Paid', 'Paid')
        AND si.invoice_date <= ? ${buildScopeWhereClause(scope, { company: 'si.company_id', branch: 'si.branch_id', businessUnit: 'si.business_unit_id' }).sql}
    `;

    const values = [as_of_date, as_of_date, as_of_date, ...buildScopeWhereClause(scope, { company: 'si.company_id', branch: 'si.branch_id', businessUnit: 'si.business_unit_id' }).values];

    if (customer_id) {
      sql += ` AND si.customer_id = ?`;
      values.push(Number(customer_id));
    }

    sql += `
      ORDER BY c.name ASC, si.due_date ASC, si.invoice_date ASC, si.id ASC
    `;

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
          const asOf = new Date(as_of_date);
          ageDays = Math.floor((asOf - due) / (1000 * 60 * 60 * 24));
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
          age_days: Math.max(ageDays, 0),
          current: round2(current),
          bucket_1_30: round2(bucket_1_30),
          bucket_31_60: round2(bucket_31_60),
          bucket_61_90: round2(bucket_61_90),
          bucket_over_90: round2(bucket_over_90),
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
      customer.bucket_over_90 = round2(
        customer.bucket_over_90 + item.bucket_over_90
      );
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
        as_of_date,
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

export const getApAgingReport = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      supplier_id = '',
      as_of_date = today(),
    } = req.query;

    let sql = `
      SELECT
        ai.id,
        ai.invoice_number,
        ai.supplier_invoice_number,
        ai.invoice_date,
        ai.due_date,
        ai.status,
        ai.total_amount,
        ai.supplier_id,
        s.name AS supplier_name,

        COALESCE((
          SELECT SUM(ap.amount_paid)
          FROM ap_payments ap
          WHERE ap.ap_invoice_id = ai.id
            AND ap.status = 'Posted'
            AND ap.payment_date <= ?
        ), 0) AS total_paid

      FROM ap_invoices ai
      INNER JOIN suppliers s
        ON s.id = ai.supplier_id
      WHERE ai.status IN ('Posted', 'Paid')
        AND ai.invoice_date <= ? ${buildScopeWhereClause(scope, { company: 'ai.company_id', branch: 'ai.branch_id', businessUnit: 'ai.business_unit_id' }).sql}
    `;

    const values = [as_of_date, as_of_date, ...buildScopeWhereClause(scope, { company: 'ai.company_id', branch: 'ai.branch_id', businessUnit: 'ai.business_unit_id' }).values];

    if (supplier_id) {
      sql += ` AND ai.supplier_id = ?`;
      values.push(Number(supplier_id));
    }

    sql += `
      ORDER BY s.name ASC, ai.due_date ASC, ai.invoice_date ASC, ai.id ASC
    `;

    const [rows] = await db.query(sql, values);

    const detailed = rows
      .map((row) => {
        const totalAmount = round2(row.total_amount);
        const totalPaid = round2(row.total_paid);
        const balance = round2(totalAmount - totalPaid);

        if (balance <= 0) return null;

        let ageDays = 0;
        if (row.due_date) {
          const due = new Date(row.due_date);
          const asOf = new Date(as_of_date);
          ageDays = Math.floor((asOf - due) / (1000 * 60 * 60 * 24));
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
          balance,
          age_days: Math.max(ageDays, 0),
          current: round2(current),
          bucket_1_30: round2(bucket_1_30),
          bucket_31_60: round2(bucket_31_60),
          bucket_61_90: round2(bucket_61_90),
          bucket_over_90: round2(bucket_over_90),
        };
      })
      .filter(Boolean);

    const supplierMap = new Map();

    for (const item of detailed) {
      if (!supplierMap.has(item.supplier_id)) {
        supplierMap.set(item.supplier_id, {
          supplier_id: item.supplier_id,
          supplier_name: item.supplier_name,
          total_balance: 0,
          current: 0,
          bucket_1_30: 0,
          bucket_31_60: 0,
          bucket_61_90: 0,
          bucket_over_90: 0,
          invoices: [],
        });
      }

      const supplier = supplierMap.get(item.supplier_id);
      supplier.total_balance = round2(supplier.total_balance + item.balance);
      supplier.current = round2(supplier.current + item.current);
      supplier.bucket_1_30 = round2(supplier.bucket_1_30 + item.bucket_1_30);
      supplier.bucket_31_60 = round2(supplier.bucket_31_60 + item.bucket_31_60);
      supplier.bucket_61_90 = round2(supplier.bucket_61_90 + item.bucket_61_90);
      supplier.bucket_over_90 = round2(
        supplier.bucket_over_90 + item.bucket_over_90
      );
      supplier.invoices.push(item);
    }

    const suppliers = Array.from(supplierMap.values());

    const summary = suppliers.reduce(
      (acc, supplier) => {
        acc.total_suppliers += 1;
        acc.total_balance = round2(acc.total_balance + supplier.total_balance);
        acc.current = round2(acc.current + supplier.current);
        acc.bucket_1_30 = round2(acc.bucket_1_30 + supplier.bucket_1_30);
        acc.bucket_31_60 = round2(acc.bucket_31_60 + supplier.bucket_31_60);
        acc.bucket_61_90 = round2(acc.bucket_61_90 + supplier.bucket_61_90);
        acc.bucket_over_90 = round2(acc.bucket_over_90 + supplier.bucket_over_90);
        return acc;
      },
      {
        as_of_date,
        total_suppliers: 0,
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
      suppliers,
    });
  } catch (error) {
    console.error('Get AP aging report error:', error);
    res.status(500).json({ message: 'Failed to fetch AP aging report' });
  }
};
