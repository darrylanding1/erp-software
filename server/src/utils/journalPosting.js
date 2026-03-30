import db from '../config/db.js';

const round2 = (value) => Number(Number(value || 0).toFixed(2));

export const getAccountsByCodes = async (connection, codes = []) => {
  if (!Array.isArray(codes) || codes.length === 0) return {};

  const [rows] = await connection.query(
    `
    SELECT id, account_code, account_name, account_type
    FROM chart_of_accounts
    WHERE account_code IN (?)
      AND is_active = 1
    `,
    [codes]
  );

  const map = {};
  rows.forEach((row) => {
    map[row.account_code] = row;
  });

  return map;
};

export const createJournalEntry = async (
  connection,
  {
    entry_date,
    reference_type,
    reference_id,
    memo,
    lines = [],
  }
) => {
  const cleanedLines = lines
    .map((line) => ({
      account_id: Number(line.account_id),
      account_code: String(line.account_code || '').trim(),
      account_name: String(line.account_name || '').trim(),
      description: line.description?.trim() || null,
      debit: round2(line.debit),
      credit: round2(line.credit),
    }))
    .filter(
      (line) =>
        line.account_id > 0 &&
        line.account_code &&
        line.account_name &&
        (line.debit > 0 || line.credit > 0)
    );

  if (cleanedLines.length < 2) {
    throw new Error('Journal entry must contain at least two valid lines');
  }

  const totalDebit = round2(
    cleanedLines.reduce((sum, line) => sum + line.debit, 0)
  );
  const totalCredit = round2(
    cleanedLines.reduce((sum, line) => sum + line.credit, 0)
  );

  if (totalDebit <= 0 || totalCredit <= 0 || totalDebit !== totalCredit) {
    throw new Error('Journal entry is unbalanced');
  }

  const entryNumber = `JE-${Date.now()}`;

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
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Posted')
    `,
    [
      entryNumber,
      entry_date,
      reference_type || null,
      reference_id || null,
      memo || null,
      totalDebit,
      totalCredit,
    ]
  );

  for (const line of cleanedLines) {
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
        entryResult.insertId,
        line.account_id,
        line.account_code,
        line.account_name,
        line.description,
        line.debit,
        line.credit,
      ]
    );
  }

  return {
    id: entryResult.insertId,
    entry_number: entryNumber,
    total_debit: totalDebit,
    total_credit: totalCredit,
  };
};

export const getJournalEntriesByReferenceTypes = async (
  connection = db,
  referenceTypes = []
) => {
  const [entryRows] = await connection.query(
    `
    SELECT *
    FROM journal_entries
    WHERE reference_type IN (?)
    ORDER BY entry_date DESC, id DESC
    `,
    [referenceTypes]
  );

  if (entryRows.length === 0) return [];

  const entryIds = entryRows.map((row) => row.id);

  const [lineRows] = await connection.query(
    `
    SELECT *
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

  return entryRows.map((entry) => ({
    ...entry,
    lines: lineMap.get(entry.id) || [],
  }));
};