import db from '../config/db.js';
import { createAuditLog, getRequestIp } from '../utils/auditTrail.js';
import {
  getPermissionCatalog,
  getPermissionMatrix,
  getRbacUsers,
  getRolesMeta,
  getUserPermissionOverrides,
  getUserWithPermissions,
  replaceRolePermissions,
  replaceUserPermissionOverrides,
} from '../services/permissionService.js';

export const getRbacAdminData = async (_req, res) => {
  try {
    const [roles, permissions, matrix, users] = await Promise.all([
      getRolesMeta(),
      getPermissionCatalog(),
      getPermissionMatrix(),
      getRbacUsers(),
    ]);

    res.json({
      roles,
      permissions,
      matrix,
      users,
    });
  } catch (error) {
    console.error('Get RBAC admin data error:', error);
    res.status(500).json({ message: 'Failed to fetch RBAC admin data' });
  }
};

export const updateRoleMatrix = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const roleId = Number(req.params.roleId);
    const permissionCodes = Array.isArray(req.body.permission_codes)
      ? req.body.permission_codes
      : [];

    if (!roleId) {
      return res.status(400).json({ message: 'Invalid role id' });
    }

    await connection.beginTransaction();

    const result = await replaceRolePermissions(connection, roleId, permissionCodes);

    await createAuditLog({
      userId: req.user?.id || null,
      action: 'UPDATE',
      moduleName: 'RBAC',
      recordId: roleId,
      description: `Updated role permission matrix for ${result.role.name}`,
      newValues: {
        role_id: result.role.id,
        role_code: result.role.code,
        role_name: result.role.name,
        permission_codes: result.permission_codes,
      },
      ipAddress: getRequestIp(req),
    });

    await connection.commit();

    const matrix = await getPermissionMatrix();
    const roleMatrix = matrix.find((item) => item.role_id === roleId);

    res.json({
      message: 'Role permissions updated successfully',
      role: result.role,
      matrix: roleMatrix,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Update role matrix error:', error);
    res.status(400).json({
      message: error.message || 'Failed to update role permissions',
    });
  } finally {
    connection.release();
  }
};

export const getUserOverrides = async (req, res) => {
  try {
    const userId = Number(req.params.userId);

    if (!userId) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await getUserWithPermissions(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const overrides = await getUserPermissionOverrides(userId);

    res.json({
      user,
      overrides: overrides.map((row) => ({
        id: row.id,
        effect: row.effect,
        permission_id: row.permission_id,
        permission_code: row.permission_code,
        permission_name: row.permission_name,
        module_name: row.module_name,
        description: row.description,
      })),
    });
  } catch (error) {
    console.error('Get user overrides error:', error);
    res.status(500).json({ message: 'Failed to fetch user overrides' });
  }
};

export const saveUserOverrides = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const userId = Number(req.params.userId);
    const overrides = Array.isArray(req.body.overrides) ? req.body.overrides : [];

    if (!userId) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const beforeUser = await getUserWithPermissions(userId);

    if (!beforeUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    await connection.beginTransaction();

    const savedOverrides = await replaceUserPermissionOverrides(
      connection,
      userId,
      overrides,
      req.user?.id || null
    );

    await createAuditLog({
      userId: req.user?.id || null,
      action: 'UPDATE',
      moduleName: 'RBAC',
      recordId: userId,
      description: `Updated permission overrides for ${beforeUser.full_name}`,
      oldValues: {
        permission_overrides: beforeUser.permission_overrides,
        permissions: beforeUser.permissions,
      },
      newValues: {
        overrides: savedOverrides,
      },
      ipAddress: getRequestIp(req),
    });

    await connection.commit();

    const afterUser = await getUserWithPermissions(userId);

    res.json({
      message: 'User permission overrides updated successfully',
      user: afterUser,
      overrides: afterUser.permission_overrides,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Save user overrides error:', error);
    res.status(400).json({
      message: error.message || 'Failed to save user overrides',
    });
  } finally {
    connection.release();
  }
};