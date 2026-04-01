import db from '../config/db.js';
import {
  assertScopeMatch,
  buildScopeWhereClause,
  requireDataScope,
} from '../middleware/dataScopeMiddleware.js';

const round2 = (value) => Number(Number(value || 0).toFixed(2));

const mapScopeInsert = (scope) => ({
  company_id: scope.company_id,
  branch_id: scope.branch_id,
  business_unit_id: scope.business_unit_id,
});

export const getChartOfAccounts = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { search = '', account_type = '', is_active = '' } = req.query;
    const scopeFilter = buildScopeWhereClause(scope);

    let sql = `
      SELECT
        id,
        account_code,
        account_name,
        account_type,
        is_active,
        created_at,
        updated_at
      FROM chart_of_accounts
      WHERE 1 = 1 ${scopeFilter.sql}
    `;
    const values = [...scopeFilter.values];

    if (search) {
      sql += ` AND (account_code LIKE ? OR account_name LIKE ?)`;
      values.push(`%${search}%`, `%${search}%`);
    }

    if (account_type) {
      sql += ` AND account_type = ?`;
      values.push(account_type);
    }

    if (is_active !== '') {
      sql += ` AND is_active = ?`;
      values.push(Number(is_active) ? 1 : 0);
    }

    sql += ` ORDER BY account_code ASC, id ASC`;

    const [rows] = await db.query(sql, values);
    res.json(rows);
  } catch (error) {
    console.error('Get chart of accounts error:', error);
    res.status(500).json({ message: 'Failed to fetch chart of accounts' });
  }
};

export const createAccount = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      account_code,
      account_name,
      account_type,
      is_active = 1,
    } = req.body;

    if (!account_code?.trim() || !account_name?.trim() || !account_type) {
      return res.status(400).json({
        message: 'Account code, account name, and account type are required',
      });
    }

    const insertScope = mapScopeInsert(scope);
    const [result] = await db.query(
      `
      INSERT INTO chart_of_accounts
      (
        account_code,
        account_name,
        account_type,
        is_active,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        account_code.trim(),
        account_name.trim(),
        account_type,
        Number(is_active) ? 1 : 0,
        insertScope.company_id,
        insertScope.branch_id,
        insertScope.business_unit_id,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT
        id,
        account_code,
        account_name,
        account_type,
        is_active,
        created_at,
        updated_at
      FROM chart_of_accounts
      WHERE id = ?
      `,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Create account error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        message: 'Account code already exists',
      });
    }

    res.status(500).json({ message: 'Failed to create account' });
  }
};

export const updateAccount = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { id } = req.params;
    const {
      account_code,
      account_name,
      account_type,
      is_active,
    } = req.body;

    const accountId = Number(id);

    if (!accountId) {
      return res.status(400).json({ message: 'Invalid account id' });
    }

    if (!account_code?.trim() || !account_name?.trim() || !account_type) {
      return res.status(400).json({
        message: 'Account code, account name, and account type are required',
      });
    }

    const [[existing]] = await db.query(
      `
      SELECT id, company_id, branch_id, business_unit_id
      FROM chart_of_accounts
      WHERE id = ?
      `,
      [accountId]
    );

    if (!existing) {
      return res.status(404).json({ message: 'Account not found' });
    }

    assertScopeMatch(existing, scope);

    await db.query(
      `
      UPDATE chart_of_accounts
      SET
        account_code = ?,
        account_name = ?,
        account_type = ?,
        is_active = ?
      WHERE id = ?
      `,
      [
        account_code.trim(),
        account_name.trim(),
        account_type,
        Number(is_active) ? 1 : 0,
        accountId,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT
        id,
        account_code,
        account_name,
        account_type,
        is_active,
        created_at,
        updated_at
      FROM chart_of_accounts
      WHERE id = ?
      `,
      [accountId]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error('Update account error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        message: 'Account code already exists',
      });
    }

    res.status(500).json({ message: 'Failed to update account' });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { id } = req.params;
    const accountId = Number(id);

    if (!accountId) {
      return res.status(400).json({ message: 'Invalid account id' });
    }

    const [[accountRow]] = await db.query(
      `
      SELECT id, company_id, branch_id, business_unit_id
      FROM chart_of_accounts
      WHERE id = ?
      LIMIT 1
      `,
      [accountId]
    );

    if (!accountRow) {
      return res.status(404).json({ message: 'Account not found' });
    }

    assertScopeMatch(accountRow, scope);

    const [[lineRow]] = await db.query(
      `
      SELECT jel.id
      FROM journal_entry_lines jel
      INNER JOIN chart_of_accounts coa ON coa.id = jel.account_id
      WHERE jel.account_id = ?
        AND coa.company_id = ?
        AND coa.branch_id <=> ?
        AND coa.business_unit_id <=> ?
      LIMIT 1
      `,
      [accountId, scope.company_id, scope.branch_id, scope.business_unit_id]
    );

    if (lineRow) {
      return res.status(400).json({
        message:
          'This account already has journal entry lines. Set it inactive instead of deleting.',
      });
    }

    const [result] = await db.query(
      `
      DELETE FROM chart_of_accounts
      WHERE id = ?
      `,
      [accountId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Account not found' });
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
};

export const getGeneralLedger = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const {
      date_from = '',
      date_to = '',
      account_id = '',
      reference_type = '',
      search = '',
      status = '',
    } = req.query;

    let sql = `
      SELECT
        je.id,
        je.entry_number,
        je.entry_date,
        je.reference_type,
        je.reference_id,
        je.memo,
        je.total_debit,
        je.total_credit,
        je.status,
        je.created_at
      FROM journal_entries je
      WHERE 1 = 1 ${scopeFilter.sql}
    `;
    const values = [...scopeFilter.values];

    if (date_from) {
      sql += ` AND je.entry_date >= ?`;
      values.push(date_from);
    }

    if (date_to) {
      sql += ` AND je.entry_date <= ?`;
      values.push(date_to);
    }

    if (reference_type) {
      sql += ` AND je.reference_type = ?`;
      values.push(reference_type);
    }

    if (status) {
      sql += ` AND je.status = ?`;
      values.push(status);
    }

    if (search) {
      sql += `
        AND (
          je.entry_number LIKE ?
          OR je.memo LIKE ?
          OR je.reference_type LIKE ?
          OR CAST(je.reference_id AS CHAR) LIKE ?
        )
      `;
      values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (account_id) {
      sql += `
        AND EXISTS (
          SELECT 1
          FROM journal_entry_lines jel
          WHERE jel.journal_entry_id = je.id
            AND jel.account_id = ?
        )
      `;
      values.push(Number(account_id));
    }

    sql += ` ORDER BY je.entry_date DESC, je.id DESC`;

    const [entryRows] = await db.query(sql, values);

    if (entryRows.length === 0) {
      return res.json([]);
    }

    const entryIds = entryRows.map((row) => row.id);

    const [lineRows] = await db.query(
      `
      SELECT
        id,
        journal_entry_id,
        account_id,
        account_code,
        account_name,
        description,
        debit,
        credit,
        created_at
      FROM journal_entry_lines
      WHERE journal_entry_id IN (?)
      ORDER BY journal_entry_id DESC, id ASC
      `,
      [entryIds]
    );

    const lineMap = new Map();

    for (const line of lineRows) {
      if (!lineMap.has(line.journal_entry_id)) {
        lineMap.set(line.journal_entry_id, []);
      }
      lineMap.get(line.journal_entry_id).push(line);
    }

    const result = entryRows.map((entry) => ({
      ...entry,
      lines: lineMap.get(entry.id) || [],
    }));

    res.json(result);
  } catch (error) {
    console.error('Get general ledger error:', error);
    res.status(500).json({ message: 'Failed to fetch general ledger' });
  }
};

export const getTrialBalance = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { date_from = '', date_to = '', account_type = '', is_active = '' } = req.query;

    let sql = `
      SELECT
        coa.id,
        coa.account_code,
        coa.account_name,
        coa.account_type,
        coa.is_active,
        COALESCE(SUM(jel.debit), 0) AS total_debit,
        COALESCE(SUM(jel.credit), 0) AS total_credit
      FROM chart_of_accounts coa
      LEFT JOIN journal_entry_lines jel
        ON coa.id = jel.account_id
      LEFT JOIN journal_entries je
        ON jel.journal_entry_id = je.id
        AND je.status = 'Posted'
    `;
    const conditions = ['coa.company_id = ?', 'coa.branch_id <=> ?', 'coa.business_unit_id <=> ?'];
    const values = [scope.company_id, scope.branch_id, scope.business_unit_id];

    if (date_from) {
      conditions.push(`(je.entry_date >= ? OR je.entry_date IS NULL)`);
      values.push(date_from);
    }

    if (date_to) {
      conditions.push(`(je.entry_date <= ? OR je.entry_date IS NULL)`);
      values.push(date_to);
    }

    if (account_type) {
      conditions.push(`coa.account_type = ?`);
      values.push(account_type);
    }

    if (is_active !== '') {
      conditions.push(`coa.is_active = ?`);
      values.push(Number(is_active) ? 1 : 0);
    }

    sql += ` WHERE ${conditions.join(' AND ')}`;
    sql += `
      GROUP BY
        coa.id,
        coa.account_code,
        coa.account_name,
        coa.account_type,
        coa.is_active
      ORDER BY coa.account_code ASC, coa.id ASC
    `;

    const [rows] = await db.query(sql, values);

    const normalizedRows = rows.map((row) => {
      const totalDebit = round2(row.total_debit);
      const totalCredit = round2(row.total_credit);

      let balance = 0;
      if (['Asset', 'Expense'].includes(row.account_type)) {
        balance = round2(totalDebit - totalCredit);
      } else {
        balance = round2(totalCredit - totalDebit);
      }

      return {
        ...row,
        total_debit: totalDebit,
        total_credit: totalCredit,
        balance,
      };
    });

    const totals = normalizedRows.reduce(
      (acc, row) => {
        acc.total_debit = round2(acc.total_debit + Number(row.total_debit || 0));
        acc.total_credit = round2(acc.total_credit + Number(row.total_credit || 0));
        return acc;
      },
      { total_debit: 0, total_credit: 0 }
    );

    res.json({
      summary: {
        total_accounts: normalizedRows.length,
        total_debit: totals.total_debit,
        total_credit: totals.total_credit,
        balanced: totals.total_debit === totals.total_credit,
      },
      items: normalizedRows,
    });
  } catch (error) {
    console.error('Get trial balance error:', error);
    res.status(500).json({ message: 'Failed to fetch trial balance' });
  }
};
