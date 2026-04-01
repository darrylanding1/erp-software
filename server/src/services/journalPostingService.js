import { createJournalEntry as createGLJournalEntry, getAccountByCode as getGLAccountByCode } from './glPostingEngine.js';

export const getAccountByCode = async (connection, accountCode) => {
  return getGLAccountByCode(connection, accountCode);
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
  }
) => {
  const resolvedScope =
    scope ||
    {
      company_id,
      branch_id,
      business_unit_id,
    };

  return createGLJournalEntry(connection, {
    entryDate: entryDate || entry_date,
    referenceType: referenceType || reference_type || null,
    referenceId: referenceId || reference_id || null,
    memo: memo || null,
    lines,
    status,
    allowDuplicateReference,
    scope: resolvedScope,
    allowSoftClosedForAdmin,
    userRole,
  });
};