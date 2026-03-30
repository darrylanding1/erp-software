import { round2 } from '../utils/number.js';

export const getAccountByCode = async (connection, accountCode) => {
  const [[row]] = await connection.query(
    `
    SELECT *
    FROM chart_of_accounts
    WHERE account_code = ?
      AND is_active = 1
    LIMIT 1
    `,
    [accountCode]
  );

  if (!row) {
    throw new Error(`Active account not found for code ${accountCode}`);
  }

  return row;
};

export const createJournalEntry = async (
  connection,
  {
    entryDate,
    referenceType,
    referenceId,
    memo,
    lines,
    status = 'Posted',
  }
) => {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Journal entry lines are required');
  }

  const totalDebit = round2(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const totalCredit = round2(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));

  if (totalDebit !== totalCredit) {
    throw new Error(`Journal entry out of balance. Debit=${totalDebit}, Credit=${totalCredit}`);
  }

  const entryNumber = `JE-${Date.now()}`;

  const [headerResult] = await connection.query(
    `
    INSERT INTO journal_entries (
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
      memo,
      totalDebit,
      totalCredit,
      status,
    ]
  );

  const journalEntryId = headerResult.insertId;

  for (const line of lines) {
    await connection.query(
      `
      INSERT INTO journal_entry_lines (
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
        journalEntryId,
        line.account_id,
        line.account_code,
        line.account_name,
        line.description ?? null,
        round2(line.debit || 0),
        round2(line.credit || 0),
      ]
    );
  }

  return journalEntryId;
};