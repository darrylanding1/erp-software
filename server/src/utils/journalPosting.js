import db from '../config/db.js';
import {
  createJournalEntry as createGLJournalEntry,
  getAccountsByCodes as getGLAccountsByCodes,
} from '../services/glPostingEngine.js';

export const getAccountsByCodes = async (connection, codes = []) => {
  return getGLAccountsByCodes(connection, codes);
};

export const createJournalEntry = async (
  connection,
  {
    entryDate,
    entry_date,
    referenceType,
    reference_type,
    referenceId,
    reference_id,
    memo,
    lines = [],
    status = 'Posted',
    scope = null,
    company_id = null,
    branch_id = null,
    business_unit_id = null,
    allowDuplicateReference = false,
    allowSoftClosedForAdmin = false,
    userRole = '',
  } = {}
) => {
  const finalEntryDate = entryDate || entry_date || null;
  const finalReferenceType = referenceType || reference_type || null;
  const finalReferenceId = referenceId || reference_id || null;

  const resolvedScope = scope || {
    company_id,
    branch_id,
    business_unit_id,
  };

  const totalDebit = lines.reduce((sum, line) => sum + Number(line?.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line?.credit || 0), 0);

  if (!finalEntryDate || !finalReferenceType || !finalReferenceId) {
    throw new Error('Invalid journal entry payload');
  }

  if (Math.abs(totalDebit - totalCredit) > 0.0001) {
    throw new Error('Journal entry not balanced');
  }

  return createGLJournalEntry(connection, {
    entryDate: finalEntryDate,
    referenceType: finalReferenceType,
    referenceId: finalReferenceId,
    memo: memo || null,
    lines,
    status,
    allowDuplicateReference,
    scope: resolvedScope,
    allowSoftClosedForAdmin,
    userRole,
  });
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
