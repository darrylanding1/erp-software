import db from '../config/db.js';

export const getAuditTrails = async (req, res) => {
  try {
    const {
      search = '',
      module_name = '',
      action = '',
      user_id = '',
      limit = 200,
    } = req.query;

    let sql = `
      SELECT
        at.id,
        at.user_id,
        u.full_name AS user_name,
        u.email AS user_email,
        at.action,
        at.module_name,
        at.record_id,
        at.description,
        at.old_values,
        at.new_values,
        at.ip_address,
        at.created_at
      FROM audit_trails at
      LEFT JOIN users u ON u.id = at.user_id
      WHERE 1 = 1
    `;
    const values = [];

    if (search) {
      sql += `
        AND (
          at.description LIKE ?
          OR at.module_name LIKE ?
          OR at.action LIKE ?
          OR u.full_name LIKE ?
          OR u.email LIKE ?
        )
      `;
      values.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      );
    }

    if (module_name) {
      sql += ' AND at.module_name = ?';
      values.push(module_name);
    }

    if (action) {
      sql += ' AND at.action = ?';
      values.push(action);
    }

    if (user_id) {
      sql += ' AND at.user_id = ?';
      values.push(user_id);
    }

    sql += ' ORDER BY at.id DESC LIMIT ?';
    values.push(Number(limit) || 200);

    const [rows] = await db.query(sql, values);

    const data = rows.map((row) => ({
      ...row,
      old_values: row.old_values ? JSON.parse(row.old_values) : null,
      new_values: row.new_values ? JSON.parse(row.new_values) : null,
    }));

    res.json(data);
  } catch (error) {
    console.error('Get audit trails error:', error);
    res.status(500).json({ message: 'Failed to fetch audit trails' });
  }
};