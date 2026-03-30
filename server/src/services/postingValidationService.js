import db from '../config/db.js';

export const getUserOrganizationScope = async (userId) => {
  const [[defaultScope]] = await db.query(
    `
    SELECT
      u.default_company_id,
      u.default_branch_id,
      u.default_business_unit_id,
      c.name AS default_company_name,
      b.name AS default_branch_name,
      bu.name AS default_business_unit_name
    FROM users u
    LEFT JOIN companies c
      ON c.id = u.default_company_id
    LEFT JOIN branches b
      ON b.id = u.default_branch_id
    LEFT JOIN business_units bu
      ON bu.id = u.default_business_unit_id
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId]
  );

  const [assignments] = await db.query(
    `
    SELECT
      usa.company_id,
      usa.branch_id,
      usa.business_unit_id,
      usa.is_default,
      c.company_code,
      c.name AS company_name,
      b.branch_code,
      b.name AS branch_name,
      bu.unit_code,
      bu.name AS business_unit_name
    FROM user_scope_assignments usa
    INNER JOIN companies c
      ON c.id = usa.company_id
    LEFT JOIN branches b
      ON b.id = usa.branch_id
    LEFT JOIN business_units bu
      ON bu.id = usa.business_unit_id
    WHERE usa.user_id = ?
    ORDER BY usa.is_default DESC, c.name, b.name, bu.name
    `,
    [userId]
  );

  return {
    default_scope: {
      company_id: defaultScope?.default_company_id || null,
      branch_id: defaultScope?.default_branch_id || null,
      business_unit_id: defaultScope?.default_business_unit_id || null,
      company_name: defaultScope?.default_company_name || null,
      branch_name: defaultScope?.default_branch_name || null,
      business_unit_name: defaultScope?.default_business_unit_name || null,
    },
    allowed_scopes: assignments,
  };
};

export const getUserWithPermissions = async (userId) => {
  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.role,
      u.status,
      u.created_at,
      u.default_company_id,
      u.default_branch_id,
      u.default_business_unit_id,
      COALESCE(
        MAX(CASE WHEN ur.is_primary = 1 THEN r.name END),
        u.role
      ) AS primary_role,
      COALESCE(
        GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR '||'),
        u.role
      ) AS roles_csv,
      COALESCE(
        GROUP_CONCAT(DISTINCT p.code ORDER BY p.code SEPARATOR '||'),
        ''
      ) AS permissions_csv
    FROM users u
    LEFT JOIN user_roles ur
      ON ur.user_id = u.id
    LEFT JOIN roles r
      ON r.id = ur.role_id
    LEFT JOIN role_permissions rp
      ON rp.role_id = r.id
    LEFT JOIN permissions p
      ON p.id = rp.permission_id
    WHERE u.id = ?
    GROUP BY
      u.id,
      u.full_name,
      u.email,
      u.role,
      u.status,
      u.created_at,
      u.default_company_id,
      u.default_branch_id,
      u.default_business_unit_id
    `,
    [userId]
  );

  const row = rows[0];

  if (!row) return null;

  const permissions = row.permissions_csv
    ? row.permissions_csv.split('||').filter(Boolean)
    : [];

  const roles = row.roles_csv
    ? row.roles_csv.split('||').filter(Boolean)
    : [row.role].filter(Boolean);

  const organization_scope = await getUserOrganizationScope(userId);

  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.primary_role || row.role,
    roles,
    permissions,
    status: row.status,
    created_at: row.created_at,
    default_company_id: row.default_company_id,
    default_branch_id: row.default_branch_id,
    default_business_unit_id: row.default_business_unit_id,
    organization_scope,
  };
};

export const assignPrimaryRoleToUser = async (connection, userId, roleCode) => {
  const [[roleRow]] = await connection.query(
    `
    SELECT id, name
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

export const getPermissionMatrix = async () => {
  const [rows] = await db.query(
    `
    SELECT
      r.code AS role_code,
      r.name AS role_name,
      p.module_name,
      p.code AS permission_code,
      p.name AS permission_name
    FROM roles r
    LEFT JOIN role_permissions rp
      ON rp.role_id = r.id
    LEFT JOIN permissions p
      ON p.id = rp.permission_id
    ORDER BY r.name, p.module_name, p.code
    `
  );

  const matrix = {};

  for (const row of rows) {
    if (!matrix[row.role_code]) {
      matrix[row.role_code] = {
        role_code: row.role_code,
        role_name: row.role_name,
        modules: {},
      };
    }

    if (!row.permission_code) continue;

    if (!matrix[row.role_code].modules[row.module_name]) {
      matrix[row.role_code].modules[row.module_name] = [];
    }

    matrix[row.role_code].modules[row.module_name].push({
      code: row.permission_code,
      name: row.permission_name,
    });
  }

  return Object.values(matrix);
};

export const getRolesMeta = async () => {
  const [rows] = await db.query(
    `
    SELECT id, code, name, description
    FROM roles
    ORDER BY name
    `
  );

  return rows;
};