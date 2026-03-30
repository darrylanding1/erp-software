import db from '../config/db.js';
import {
  findAccountingPeriodByDate,
  assertPostingDateAllowed,
  generateMonthlyAccountingPeriods,
} from '../services/accountingPeriodService.js';

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const today = () => new Date().toISOString().split('T')[0];

const getUserId = (req) => req.user?.id || null;
const getUserRole = (req) => req.user?.role || '';

const writeAuditTrail = async (
  connection,
  req,
  action,
  recordId,
  description,
  oldValues = null,
  newValues = null
) => {
  await connection.query(
    `
    INSERT INTO audit_trails (
      user_id,
      action,
      module_name,
      record_id,
      description,
      old_values,
      new_values,
      ip_address
    )
    VALUES (?, ?, 'Accounting Periods', ?, ?, ?, ?, ?)
    `,
    [
      getUserId(req),
      action,
      recordId,
      description,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      req.ip || req.headers['x-forwarded-for'] || null,
    ]
  );
};

export const getAccountingPeriods = async (req, res) => {
  try {
    const {
      year = '',
      status = '',
      date_from = '',
      date_to = '',
    } = req.query;

    const conditions = [];
    const values = [];

    if (year) {
      conditions.push('period_year = ?');
      values.push(Number(year));
    }

    if (status) {
      conditions.push('status = ?');
      values.push(status);
    }

    if (date_from) {
      conditions.push('end_date >= ?');
      values.push(date_from);
    }

    if (date_to) {
      conditions.push('start_date <= ?');
      values.push(date_to);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await db.query(
      `
      SELECT
        id,
        period_code,
        period_year,
        period_month,
        start_date,
        end_date,
        status,
        close_notes,
        soft_closed_by,
        soft_closed_at,
        hard_closed_by,
        hard_closed_at,
        reopened_by,
        reopened_at,
        created_at,
        updated_at
      FROM accounting_periods
      ${whereClause}
      ORDER BY period_year DESC, period_month DESC
      `,
      values
    );

    res.json({
      items: rows,
    });
  } catch (error) {
    console.error('Get accounting periods error:', error);
    res.status(500).json({ message: 'Failed to fetch accounting periods' });
  }
};

export const generateAccountingPeriods = async (req, res) => {
  try {
    const {
      start_year = new Date().getFullYear(),
      start_month = 1,
      months = 12,
    } = req.body;

    const created = await generateMonthlyAccountingPeriods({
      startYear: Number(start_year),
      startMonth: Number(start_month),
      months: Number(months),
    });

    res.status(201).json({
      message: created.length
        ? 'Accounting periods generated successfully'
        : 'No new accounting periods were created',
      items: created,
    });
  } catch (error) {
    console.error('Generate accounting periods error:', error);
    res.status(500).json({ message: 'Failed to generate accounting periods' });
  }
};

export const getPostingLockStatus = async (req, res) => {
  try {
    const { posting_date = today() } = req.query;

    const period = await findAccountingPeriodByDate(db, posting_date);

    if (!period) {
      return res.status(404).json({
        allowed: false,
        posting_date,
        message: 'No accounting period found for this posting date',
      });
    }

    let allowed = true;
    let message = 'Posting is allowed';

    if (period.status === 'Hard Closed') {
      allowed = false;
      message = 'Posting blocked: period is hard closed';
    } else if (period.status === 'Soft Closed') {
      const isAdmin = getUserRole(req) === 'Admin';
      allowed = isAdmin;
      message = isAdmin
        ? 'Posting allowed for Admin only: period is soft closed'
        : 'Posting blocked: period is soft closed';
    }

    res.json({
      allowed,
      posting_date,
      period,
      message,
    });
  } catch (error) {
    console.error('Get posting lock status error:', error);
    res.status(500).json({ message: 'Failed to check posting lock status' });
  }
};

export const softCloseAccountingPeriod = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const periodId = Number(req.params.id);
    const { close_notes = '' } = req.body;

    if (!periodId) {
      return res.status(400).json({ message: 'Invalid accounting period id' });
    }

    await connection.beginTransaction();

    const [[period]] = await connection.query(
      `
      SELECT *
      FROM accounting_periods
      WHERE id = ?
      LIMIT 1
      `,
      [periodId]
    );

    if (!period) {
      await connection.rollback();
      return res.status(404).json({ message: 'Accounting period not found' });
    }

    if (period.status === 'Hard Closed') {
      await connection.rollback();
      return res.status(400).json({
        message: 'Hard-closed period cannot be soft-closed',
      });
    }

    const oldValues = { ...period };

    await connection.query(
      `
      UPDATE accounting_periods
      SET
        status = 'Soft Closed',
        close_notes = ?,
        soft_closed_by = ?,
        soft_closed_at = NOW()
      WHERE id = ?
      `,
      [close_notes || null, getUserId(req), periodId]
    );

    const [[updated]] = await connection.query(
      `
      SELECT *
      FROM accounting_periods
      WHERE id = ?
      LIMIT 1
      `,
      [periodId]
    );

    await writeAuditTrail(
      connection,
      req,
      'SOFT_CLOSE',
      periodId,
      `Soft-closed accounting period ${updated.period_code}`,
      oldValues,
      updated
    );

    await connection.commit();

    res.json({
      message: `Accounting period ${updated.period_code} soft-closed successfully`,
      item: updated,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Soft close accounting period error:', error);
    res.status(500).json({ message: 'Failed to soft-close accounting period' });
  } finally {
    connection.release();
  }
};

export const hardCloseAccountingPeriod = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const periodId = Number(req.params.id);
    const { close_notes = '' } = req.body;

    if (!periodId) {
      return res.status(400).json({ message: 'Invalid accounting period id' });
    }

    await connection.beginTransaction();

    const [[period]] = await connection.query(
      `
      SELECT *
      FROM accounting_periods
      WHERE id = ?
      LIMIT 1
      `,
      [periodId]
    );

    if (!period) {
      await connection.rollback();
      return res.status(404).json({ message: 'Accounting period not found' });
    }

    const oldValues = { ...period };

    await connection.query(
      `
      UPDATE accounting_periods
      SET
        status = 'Hard Closed',
        close_notes = ?,
        hard_closed_by = ?,
        hard_closed_at = NOW()
      WHERE id = ?
      `,
      [close_notes || null, getUserId(req), periodId]
    );

    const [[updated]] = await connection.query(
      `
      SELECT *
      FROM accounting_periods
      WHERE id = ?
      LIMIT 1
      `,
      [periodId]
    );

    await writeAuditTrail(
      connection,
      req,
      'HARD_CLOSE',
      periodId,
      `Hard-closed accounting period ${updated.period_code}`,
      oldValues,
      updated
    );

    await connection.commit();

    res.json({
      message: `Accounting period ${updated.period_code} hard-closed successfully`,
      item: updated,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Hard close accounting period error:', error);
    res.status(500).json({ message: 'Failed to hard-close accounting period' });
  } finally {
    connection.release();
  }
};

export const reopenAccountingPeriod = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const periodId = Number(req.params.id);
    const { close_notes = '' } = req.body;

    if (!periodId) {
      return res.status(400).json({ message: 'Invalid accounting period id' });
    }

    await connection.beginTransaction();

    const [[period]] = await connection.query(
      `
      SELECT *
      FROM accounting_periods
      WHERE id = ?
      LIMIT 1
      `,
      [periodId]
    );

    if (!period) {
      await connection.rollback();
      return res.status(404).json({ message: 'Accounting period not found' });
    }

    const oldValues = { ...period };

    await connection.query(
      `
      UPDATE accounting_periods
      SET
        status = 'Open',
        close_notes = ?,
        reopened_by = ?,
        reopened_at = NOW()
      WHERE id = ?
      `,
      [close_notes || null, getUserId(req), periodId]
    );

    const [[updated]] = await connection.query(
      `
      SELECT *
      FROM accounting_periods
      WHERE id = ?
      LIMIT 1
      `,
      [periodId]
    );

    await writeAuditTrail(
      connection,
      req,
      'REOPEN',
      periodId,
      `Reopened accounting period ${updated.period_code}`,
      oldValues,
      updated
    );

    await connection.commit();

    res.json({
      message: `Accounting period ${updated.period_code} reopened successfully`,
      item: updated,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Reopen accounting period error:', error);
    res.status(500).json({ message: 'Failed to reopen accounting period' });
  } finally {
    connection.release();
  }
};

export const validatePostingDate = async (req, res) => {
  try {
    const {
      posting_date = today(),
      allow_soft_closed_for_admin = 'true',
    } = req.query;

    const period = await assertPostingDateAllowed(db, posting_date, {
      allowSoftClosedForAdmin: allow_soft_closed_for_admin === 'true',
      userRole: getUserRole(req),
    });

    res.json({
      allowed: true,
      posting_date,
      period,
      message: `Posting date ${posting_date} is allowed`,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      allowed: false,
      posting_date: req.query.posting_date || today(),
      message: error.message || 'Posting date is not allowed',
    });
  }
};