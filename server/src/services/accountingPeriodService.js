import db from '../config/db.js';

const toIsoDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
};

const buildPeriodCode = (year, month) =>
  `${year}-${String(month).padStart(2, '0')}`;

export const findAccountingPeriodByDate = async (connection, postingDate) => {
  const isoDate = toIsoDate(postingDate);

  if (!isoDate) {
    throw new Error('Invalid posting date');
  }

  const [[period]] = await connection.query(
    `
    SELECT
      id,
      period_code,
      period_year,
      period_month,
      start_date,
      end_date,
      status
    FROM accounting_periods
    WHERE ? BETWEEN start_date AND end_date
    LIMIT 1
    `,
    [isoDate]
  );

  return period || null;
};

export const assertPostingDateAllowed = async (
  connection,
  postingDate,
  options = {}
) => {
  const { allowSoftClosedForAdmin = false, userRole = '' } = options;

  const period = await findAccountingPeriodByDate(connection, postingDate);

  if (!period) {
    const error = new Error(
      `No accounting period found for posting date ${toIsoDate(postingDate)}`
    );
    error.statusCode = 400;
    throw error;
  }

  if (period.status === 'Hard Closed') {
    const error = new Error(
      `Posting date ${toIsoDate(postingDate)} is inside hard-closed period ${period.period_code}`
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    period.status === 'Soft Closed' &&
    !(allowSoftClosedForAdmin && userRole === 'Admin')
  ) {
    const error = new Error(
      `Posting date ${toIsoDate(postingDate)} is inside soft-closed period ${period.period_code}`
    );
    error.statusCode = 400;
    throw error;
  }

  return period;
};

export const generateMonthlyAccountingPeriods = async ({
  startYear,
  startMonth = 1,
  months = 12,
}) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const created = [];

    let year = Number(startYear);
    let month = Number(startMonth);

    for (let i = 0; i < Number(months); i += 1) {
      const current = new Date(Date.UTC(year, month - 1, 1));
      const next = new Date(Date.UTC(year, month, 1));
      const lastDay = new Date(next.getTime() - 24 * 60 * 60 * 1000);

      const startDate = current.toISOString().split('T')[0];
      const endDate = lastDay.toISOString().split('T')[0];
      const periodCode = buildPeriodCode(year, month);

      const [[existing]] = await connection.query(
        `
        SELECT id
        FROM accounting_periods
        WHERE period_year = ? AND period_month = ?
        LIMIT 1
        `,
        [year, month]
      );

      if (!existing) {
        const [result] = await connection.query(
          `
          INSERT INTO accounting_periods (
            period_code,
            period_year,
            period_month,
            start_date,
            end_date,
            status
          )
          VALUES (?, ?, ?, ?, ?, 'Open')
          `,
          [periodCode, year, month, startDate, endDate]
        );

        created.push({
          id: result.insertId,
          period_code: periodCode,
          start_date: startDate,
          end_date: endDate,
          status: 'Open',
        });
      }

      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }

    await connection.commit();

    return created;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};