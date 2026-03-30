import db from '../config/db.js';

const normalizePermissionCodes = (codes = []) =>
  [...new Set((Array.isArray(codes) ? codes : []).filter(Boolean))].sort();

const groupPermissionsByModule = (rows) => {
  const modules = {};

  for (const row of rows) {
    if (!modules[row.module_name]) {
      modules[row.module_name] = [];
    }

    modules[row.module_name].push({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
    });
  }

  return Object.entries(modules).map(([module_name, permissions]) => ({
    module_name,
    permissions,
  }));
};

export const getRolesMeta = async () => {
  const [rows] = await db.query(
    `
    SELECT id, code, name, description, is_system
    FROM roles
    ORDER BY name
    `
  );

  return rows;
};

export const getAllPermissions = async () => {
  const [rows] = await db.query(
    `
    SELECT id, code, name, module_name, description
    FROM permissions
    ORDER BY module_name, code
    `
  );

  return rows;
};

export const getPermissionCatalog = async () => {
  const permissions = await getAllPermissions();
  return groupPermissionsByModule(permissions);
};

export const assignPrimaryRoleToUser = async (connection, userId, roleCode) => {
  const [[roleRow]] = await connection.query(
    `
    SELECT id, code, name
    FROM roles
    WHERE code = ?
    LIMIT 1
    `,
    [roleCode]
  );

  if (!roleRow) {
    throw new Error(`Role not found: ${roleCode}`);
  }

  await connection.query(
    `
    UPDATE user_roles
    SET is_primary = 0
    WHERE user_id = ?
    `,
    [userId]
  );

  await connection.query(
    `
    INSERT INTO user_roles (user_id, role_id, is_primary)
    VALUES (?, ?, 1)
    ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary)
    `,
    [userId, roleRow.id]
  );

  await connection.query(
    `
    UPDATE users
    SET role = ?
    WHERE id = ?
    `,
    [roleRow.name, userId]
  );

  return roleRow;
};

export const getUserRolesDetailed = async (userId, connection = db) => {
  const [rows] = await connection.query(
    `
    SELECT
      r.id,
      r.code,
      r.name,
      ur.is_primary
    FROM user_roles ur
    INNER JOIN roles r
      ON r.id = ur.role_id
    WHERE ur.user_id = ?
    ORDER BY ur.is_primary DESC, r.name ASC
    `,
    [userId]
  );

  return rows;
};

export const getUserPermissionOverrides = async (userId, connection = db) => {
  const [rows] = await connection.query(
    `
    SELECT
      upo.id,
      upo.effect,
      p.id AS permission_id,
      p.code AS permission_code,
      p.name AS permission_name,
      p.module_name,
      p.description
    FROM user_permission_overrides upo
    INNER JOIN permissions p
      ON p.id = upo.permission_id
    WHERE upo.user_id = ?
    ORDER BY p.module_name, p.code
    `,
    [userId]
  );

  return rows;
};

export const getRolePermissionCodes = async (roleId, connection = db) => {
  const [rows] = await connection.query(
    `
    SELECT p.code
    FROM role_permissions rp
    INNER JOIN permissions p
      ON p.id = rp.permission_id
    WHERE rp.role_id = ?
    ORDER BY p.code
    `,
    [roleId]
  );

  return rows.map((row) => row.code);
};

export const getUserWithPermissions = async (userId) => {
  const [[userRow]] = await db.query(
    `
    SELECT
      id,
      full_name,
      email,
      role,
      status,
      created_at,
      default_company_id,
      default_branch_id,
      default_business_unit_id
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (!userRow) {
    return null;
  }

  const roles = await getUserRolesDetailed(userId);
  const roleIds = roles.map((role) => role.id);

  let rolePermissionRows = [];

  if (roleIds.length > 0) {
    const [rows] = await db.query(
      `
      SELECT DISTINCT
        p.code,
        p.name,
        p.module_name
      FROM role_permissions rp
      INNER JOIN permissions p
        ON p.id = rp.permission_id
      WHERE rp.role_id IN (?)
      ORDER BY p.code
      `,
      [roleIds]
    );

    rolePermissionRows = rows;
  }

  const overrideRows = await getUserPermissionOverrides(userId);

  const permissionMap = new Map();

  for (const row of rolePermissionRows) {
    permissionMap.set(row.code, {
      code: row.code,
      name: row.name,
      module_name: row.module_name,
      allowed: true,
      source: 'role',
    });
  }

  for (const row of overrideRows) {
    permissionMap.set(row.permission_code, {
      code: row.permission_code,
      name: row.permission_name,
      module_name: row.module_name,
      allowed: row.effect === 'allow',
      source: `user_${row.effect}`,
    });
  }

  const effectivePermissions = [...permissionMap.values()]
    .filter((item) => item.allowed)
    .map((item) => item.code)
    .sort();

  const primaryRole = roles.find((role) => Number(role.is_primary) === 1) || roles[0] || null;

  return {
    id: userRow.id,
    full_name: userRow.full_name,
    email: userRow.email,
    role: primaryRole?.name || userRow.role,
    role_code: primaryRole?.code || null,
    roles: roles.map((item) => item.name),
    role_codes: roles.map((item) => item.code),
    roles_detailed: roles,
    permissions: effectivePermissions,
    permission_sources: Object.fromEntries(
      [...permissionMap.values()].map((item) => [item.code, item.source])
    ),
    permission_overrides: overrideRows.map((row) => ({
      id: row.id,
      effect: row.effect,
      permission_id: row.permission_id,
      permission_code: row.permission_code,
      permission_name: row.permission_name,
      module_name: row.module_name,
      description: row.description,
    })),
    status: userRow.status,
    created_at: userRow.created_at,
    default_company_id: userRow.default_company_id,
    default_branch_id: userRow.default_branch_id,
    default_business_unit_id: userRow.default_business_unit_id,
  };
};

export const getPermissionMatrix = async () => {
  const [rows] = await db.query(
    `
    SELECT
      r.id AS role_id,
      r.code AS role_code,
      r.name AS role_name,
      p.id AS permission_id,
      p.code AS permission_code,
      p.name AS permission_name,
      p.module_name,
      p.description,
      CASE WHEN rp.id IS NULL THEN 0 ELSE 1 END AS granted
    FROM roles r
    CROSS JOIN permissions p
    LEFT JOIN role_permissions rp
      ON rp.role_id = r.id
     AND rp.permission_id = p.id
    ORDER BY r.name, p.module_name, p.code
    `
  );

  const matrix = {};

  for (const row of rows) {
    if (!matrix[row.role_code]) {
      matrix[row.role_code] = {
        role_id: row.role_id,
        role_code: row.role_code,
        role_name: row.role_name,
        modules: {},
      };
    }

    if (!matrix[row.role_code].modules[row.module_name]) {
      matrix[row.role_code].modules[row.module_name] = [];
    }

    matrix[row.role_code].modules[row.module_name].push({
      permission_id: row.permission_id,
      code: row.permission_code,
      name: row.permission_name,
      description: row.description,
      granted: Number(row.granted) === 1,
    });
  }

  return Object.values(matrix);
};

export const replaceRolePermissions = async (
  connection,
  roleId,
  permissionCodes = []
) => {
  const normalizedCodes = normalizePermissionCodes(permissionCodes);

  const [[roleRow]] = await connection.query(
    `
    SELECT id, code, name
    FROM roles
    WHERE id = ?
    LIMIT 1
    `,
    [roleId]
  );

  if (!roleRow) {
    throw new Error('Role not found');
  }

  let permissionRows = [];

  if (normalizedCodes.length > 0) {
    const [rows] = await connection.query(
      `
      SELECT id, code
      FROM permissions
      WHERE code IN (?)
      `,
      [normalizedCodes]
    );

    permissionRows = rows;

    if (rows.length !== normalizedCodes.length) {
      const found = new Set(rows.map((row) => row.code));
      const missing = normalizedCodes.filter((code) => !found.has(code));
      throw new Error(`Unknown permission codes: ${missing.join(', ')}`);
    }
  }

  await connection.query(
    `
    DELETE FROM role_permissions
    WHERE role_id = ?
    `,
    [roleId]
  );

  if (permissionRows.length > 0) {
    const values = permissionRows.map((row) => [roleId, row.id]);
    await connection.query(
      `
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES ?
      `,
      [values]
    );
  }

  return {
    role: roleRow,
    permission_codes: normalizedCodes,
  };
};

export const replaceUserPermissionOverrides = async (
  connection,
  userId,
  overrides = [],
  actorUserId = null
) => {
  const normalizedOverrides = [...new Map(
    (Array.isArray(overrides) ? overrides : [])
      .filter(
        (item) =>
          item &&
          item.permission_code &&
          ['allow', 'deny'].includes(String(item.effect || '').toLowerCase())
      )
      .map((item) => [
        item.permission_code,
        {
          permission_code: item.permission_code,
          effect: String(item.effect).toLowerCase(),
        },
      ])
  ).values()];

  const [[userRow]] = await connection.query(
    `
    SELECT id
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (!userRow) {
    throw new Error('User not found');
  }

  await connection.query(
    `
    DELETE FROM user_permission_overrides
    WHERE user_id = ?
    `,
    [userId]
  );

  if (normalizedOverrides.length === 0) {
    return [];
  }

  const permissionCodes = normalizedOverrides.map((item) => item.permission_code);

  const [permissionRows] = await connection.query(
    `
    SELECT id, code
    FROM permissions
    WHERE code IN (?)
    `,
    [permissionCodes]
  );

  if (permissionRows.length !== permissionCodes.length) {
    const found = new Set(permissionRows.map((row) => row.code));
    const missing = permissionCodes.filter((code) => !found.has(code));
    throw new Error(`Unknown permission codes: ${missing.join(', ')}`);
  }

  const permissionIdByCode = Object.fromEntries(
    permissionRows.map((row) => [row.code, row.id])
  );

  const values = normalizedOverrides.map((item) => [
    userId,
    permissionIdByCode[item.permission_code],
    item.effect,
    actorUserId,
    actorUserId,
  ]);

  await connection.query(
    `
    INSERT INTO user_permission_overrides
      (user_id, permission_id, effect, created_by, updated_by)
    VALUES ?
    `,
    [values]
  );

  return normalizedOverrides;
};

export const getRbacUsers = async () => {
  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.status,
      COALESCE(MAX(CASE WHEN ur.is_primary = 1 THEN r.code END), NULL) AS role_code,
      COALESCE(MAX(CASE WHEN ur.is_primary = 1 THEN r.name END), u.role) AS role_name
    FROM users u
    LEFT JOIN user_roles ur
      ON ur.user_id = u.id
    LEFT JOIN roles r
      ON r.id = ur.role_id
    GROUP BY u.id, u.full_name, u.email, u.status, u.role
    ORDER BY u.full_name ASC
    `
  );

  return rows;
};