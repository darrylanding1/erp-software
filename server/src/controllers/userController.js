import bcrypt from 'bcryptjs';
import db from '../config/db.js';
import { createAuditLog, getRequestIp } from '../utils/auditTrail.js';
import {
  assignPrimaryRoleToUser,
  getRolesMeta,
  getUserWithPermissions,
} from '../services/permissionService.js';

export const getUsers = async (req, res) => {
  try {
    const { search = '', role = '', status = '' } = req.query;

    let sql = `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.status,
        u.created_at,
        COALESCE(MAX(CASE WHEN ur.is_primary = 1 THEN r.code END), NULL) AS role_code,
        COALESCE(MAX(CASE WHEN ur.is_primary = 1 THEN r.name END), u.role) AS role
      FROM users u
      LEFT JOIN user_roles ur
        ON ur.user_id = u.id
      LEFT JOIN roles r
        ON r.id = ur.role_id
      WHERE 1 = 1
    `;
    const values = [];

    if (search) {
      sql += ' AND (u.full_name LIKE ? OR u.email LIKE ?)';
      values.push(`%${search}%`, `%${search}%`);
    }

    if (role) {
      sql += ' AND (r.code = ? OR r.name = ? OR u.role = ?)';
      values.push(role, role, role);
    }

    if (status) {
      sql += ' AND u.status = ?';
      values.push(status);
    }

    sql += `
      GROUP BY u.id, u.full_name, u.email, u.status, u.created_at, u.role
      ORDER BY u.id DESC
    `;

    const [rows] = await db.query(sql, values);
    res.json(rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
};

export const getUsersMeta = async (_req, res) => {
  try {
    const roles = await getRolesMeta();
    res.json({ roles });
  } catch (error) {
    console.error('Get users meta error:', error);
    res.status(500).json({ message: 'Failed to fetch user metadata' });
  }
};

export const createUser = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      full_name,
      email,
      status = 'Active',
      password,
      role_code = 'inventory_clerk',
    } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        message: 'Full name, email, and password are required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long',
      });
    }

    await connection.beginTransaction();

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await connection.query(
      `
      INSERT INTO users (full_name, email, role, status, password)
      VALUES (?, ?, ?, ?, ?)
      `,
      [full_name, email, role_code, status, passwordHash]
    );

    const roleRow = await assignPrimaryRoleToUser(connection, result.insertId, role_code);
    const createdUser = await getUserWithPermissions(result.insertId);

    await createAuditLog({
      userId: req.user?.id || null,
      action: 'CREATE',
      moduleName: 'Users',
      recordId: createdUser.id,
      description: `Created user ${createdUser.full_name}`,
      newValues: {
        ...createdUser,
        assigned_role: roleRow.name,
      },
      ipAddress: getRequestIp(req),
    });

    await connection.commit();
    res.status(201).json(createdUser);
  } catch (error) {
    await connection.rollback();
    console.error('Create user error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Email already exists' });
    }

    if (String(error.message || '').includes('Role not found')) {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to create user' });
  } finally {
    connection.release();
  }
};

export const updateUser = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id } = req.params;
    const { full_name, email, status, password, role_code } = req.body;

    const existingUser = await getUserWithPermissions(id);

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    await connection.beginTransaction();

    let sql = `
      UPDATE users
      SET full_name = ?, email = ?, status = ?
    `;
    const values = [full_name, email, status || 'Active'];

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({
          message: 'Password must be at least 8 characters long',
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      sql += ', password = ?';
      values.push(passwordHash);
    }

    sql += ' WHERE id = ?';
    values.push(id);

    await connection.query(sql, values);

    if (role_code) {
      await assignPrimaryRoleToUser(connection, id, role_code);
    }

    const updatedUser = await getUserWithPermissions(id);

    await createAuditLog({
      userId: req.user?.id || null,
      action: 'UPDATE',
      moduleName: 'Users',
      recordId: updatedUser.id,
      description: `Updated user ${updatedUser.full_name}`,
      oldValues: existingUser,
      newValues: updatedUser,
      ipAddress: getRequestIp(req),
    });

    await connection.commit();
    res.json(updatedUser);
  } catch (error) {
    await connection.rollback();
    console.error('Update user error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Email already exists' });
    }

    if (String(error.message || '').includes('Role not found')) {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to update user' });
  } finally {
    connection.release();
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const existingUser = await getUserWithPermissions(id);

    if (!existingUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    await createAuditLog({
      userId: req.user?.id || null,
      action: 'DELETE',
      moduleName: 'Users',
      recordId: existingUser.id,
      description: `Deleted user ${existingUser.full_name}`,
      oldValues: existingUser,
      ipAddress: getRequestIp(req),
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete user' });
  }
};