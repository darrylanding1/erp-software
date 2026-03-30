import { assertPostingDateAllowed } from '../services/accountingPeriodService.js';

export const ensurePostingDateIsOpen = async (
  connection,
  postingDate,
  req,
  options = {}
) => {
  return assertPostingDateAllowed(connection, postingDate, {
    allowSoftClosedForAdmin: options.allowSoftClosedForAdmin ?? true,
    userRole: req.user?.role || '',
  });
};