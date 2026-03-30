import db from '../config/db.js';

const toNullableInt = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const normalizeScope = (input = {}) => ({
  company_id: toNullableInt(input.company_id ?? input.companyId),
  branch_id: toNullableInt(input.branch_id ?? input.branchId),
  business_unit_id: toNullableInt(input.business_unit_id ?? input.businessUnitId),
});

export const getOrganizationTree = async () => {
  const [companies] = await db.query(
    `
    SELECT id, company_code, name, legal_name, tax_id, base_currency, country_code, status
    FROM companies
    ORDER BY name
    `
  );

  const [branches] = await db.query(
    `
    SELECT id, company_id, branch_code, name, address, status
    FROM branches
    ORDER BY name
    `
  );

  const [businessUnits] = await db.query(
    `
    SELECT id, company_id, branch_id, unit_code, name, status
    FROM business_units
    ORDER BY name
    `
  );

  return companies.map((company) => ({
    ...company,
    branches: branches
      .filter((branch) => branch.company_id === company.id)
      .map((branch) => ({
        ...branch,
        business_units: businessUnits.filter(
          (unit) => unit.company_id === company.id && unit.branch_id === branch.id
        ),
      })),
    company_level_business_units: businessUnits.filter(
      (unit) => unit.company_id === company.id && unit.branch_id === null
    ),
  }));
};

export const getUserScopeAssignments = async (userId) => {
  const [rows] = await db.query(
    `
    SELECT
      usa.id,
      usa.user_id,
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

  return rows;
};

export const validateOrganizationRelation = async ({
  company_id,
  branch_id,
  business_unit_id,
}) => {
  if (!company_id) {
    throw new Error('Company is required');
  }

  const [[company]] = await db.query(
    `
    SELECT id, status
    FROM companies
    WHERE id = ?
    LIMIT 1
    `,
    [company_id]
  );

  if (!company) {
    throw new Error('Company not found');
  }

  if (company.status !== 'Active') {
    throw new Error('Company is inactive');
  }

  if (branch_id) {
    const [[branch]] = await db.query(
      `
      SELECT id, company_id, status
      FROM branches
      WHERE id = ?
      LIMIT 1
      `,
      [branch_id]
    );

    if (!branch) {
      throw new Error('Branch not found');
    }

    if (branch.company_id !== company_id) {
      throw new Error('Branch does not belong to selected company');
    }

    if (branch.status !== 'Active') {
      throw new Error('Branch is inactive');
    }
  }

  if (business_unit_id) {
    const [[businessUnit]] = await db.query(
      `
      SELECT id, company_id, branch_id, status
      FROM business_units
      WHERE id = ?
      LIMIT 1
      `,
      [business_unit_id]
    );

    if (!businessUnit) {
      throw new Error('Business unit not found');
    }

    if (businessUnit.company_id !== company_id) {
      throw new Error('Business unit does not belong to selected company');
    }

    if (branch_id && businessUnit.branch_id && businessUnit.branch_id !== branch_id) {
      throw new Error('Business unit does not belong to selected branch');
    }

    if (businessUnit.status !== 'Active') {
      throw new Error('Business unit is inactive');
    }
  }

  return true;
};

export const userHasScopeAccess = async (userId, scope) => {
  const normalized = normalizeScope(scope);

  if (!normalized.company_id) return false;

  const [rows] = await db.query(
    `
    SELECT id
    FROM user_scope_assignments
    WHERE user_id = ?
      AND company_id = ?
      AND (
        branch_id IS NULL
        OR branch_id = ?
      )
      AND (
        business_unit_id IS NULL
        OR business_unit_id = ?
      )
    LIMIT 1
    `,
    [userId, normalized.company_id, normalized.branch_id, normalized.business_unit_id]
  );

  return rows.length > 0;
};

export const getDefaultUserScope = async (userId) => {
  const [[row]] = await db.query(
    `
    SELECT
      default_company_id AS company_id,
      default_branch_id AS branch_id,
      default_business_unit_id AS business_unit_id
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [userId]
  );

  return row || {
    company_id: null,
    branch_id: null,
    business_unit_id: null,
  };
};