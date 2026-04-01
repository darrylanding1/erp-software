import db from '../config/db.js';

export const createAuditLog = async ({
  userId = null,
  action,
  moduleName,
  recordId = null,
  description = null,
  oldValues = null,
  newValues = null,
  ipAddress = null,
  company_id = null,
  branch_id = null,
  business_unit_id = null,
}) => {
  try {
    await db.query(
      `
      INSERT INTO audit_trails (
        user_id,
        action,
        module_name,
        record_id,
        description,
        old_values,
        new_values,
        ip_address,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        userId,
        action,
        moduleName,
        recordId,
        description,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        ipAddress,
        company_id,
        branch_id,
        business_unit_id,
      ]
    );
  } catch (error) {
    console.error('Create audit log error:', error);
  }
};

export const getRequestIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || null;
};
