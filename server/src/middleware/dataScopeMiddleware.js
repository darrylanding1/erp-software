import {
  getDefaultUserScope,
  normalizeScope,
  userHasScopeAccess,
  validateOrganizationRelation,
} from '../services/organizationService.js';

const safeObject = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value;
};

const firstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '');

const getHeaderValue = (headers, key) => {
  if (!headers) return undefined;

  return headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
};

export const pickScopeFromRequest = (req = {}) => {
  const headers = safeObject(req.headers);
  const query = safeObject(req.query);
  const method = String(req.method || '').toUpperCase();

  const body = method === 'GET' ? {} : safeObject(req.body);

  return normalizeScope({
    company_id: firstDefined(
      getHeaderValue(headers, 'x-company-id'),
      query.company_id,
      query.companyId,
      body.company_id,
      body.companyId
    ),
    branch_id: firstDefined(
      getHeaderValue(headers, 'x-branch-id'),
      query.branch_id,
      query.branchId,
      body.branch_id,
      body.branchId
    ),
    business_unit_id: firstDefined(
      getHeaderValue(headers, 'x-business-unit-id'),
      query.business_unit_id,
      query.businessUnitId,
      body.business_unit_id,
      body.businessUnitId
    ),
  });
};

export const attachDataScope = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const requestScope = pickScopeFromRequest(req);
    const defaultScope = normalizeScope(await getDefaultUserScope(req.user.id));

    const finalScope = normalizeScope({
      company_id: requestScope.company_id ?? defaultScope.company_id,
      branch_id: requestScope.branch_id ?? defaultScope.branch_id,
      business_unit_id:
        requestScope.business_unit_id ?? defaultScope.business_unit_id,
    });

    if (!finalScope.company_id) {
      return res.status(400).json({
        message: 'No active company scope found. Select an organization scope first.',
      });
    }

    await validateOrganizationRelation(finalScope);

    const allowed = await userHasScopeAccess(req.user.id, finalScope);

    if (!allowed) {
      return res.status(403).json({
        message:
          'You do not have access to the requested company / branch / business unit scope.',
      });
    }

    req.dataScope = finalScope;
    req.activeCompanyId = finalScope.company_id;
    req.activeBranchId = finalScope.branch_id;
    req.activeBusinessUnitId = finalScope.business_unit_id;

    next();
  } catch (error) {
    console.error('Attach data scope error:', error);

    return res.status(400).json({
      message: error.message || 'Invalid data scope',
    });
  }
};

export const buildScopeWhereClause = (
  scope,
  columns = {
    company: 'company_id',
    branch: 'branch_id',
    businessUnit: 'business_unit_id',
  }
) => {
  let sql = '';
  const values = [];

  if (scope?.company_id && columns.company) {
    sql += ` AND ${columns.company} = ?`;
    values.push(scope.company_id);
  }

  if (scope?.branch_id && columns.branch) {
    sql += ` AND ${columns.branch} = ?`;
    values.push(scope.branch_id);
  }

  if (scope?.business_unit_id && columns.businessUnit) {
    sql += ` AND ${columns.businessUnit} = ?`;
    values.push(scope.business_unit_id);
  }

  return { sql, values };
};

export const applyDataScopeFilter = ({
  baseSql,
  baseValues = [],
  scope,
  columns,
}) => {
  const { sql, values } = buildScopeWhereClause(scope, columns);

  return {
    sql: `${baseSql}${sql}`,
    values: [...baseValues, ...values],
  };
};

export const assertScopeMatch = (
  record,
  scope,
  columns = {
    company: 'company_id',
    branch: 'branch_id',
    businessUnit: 'business_unit_id',
  }
) => {
  if (!record) {
    throw new Error('Record not found');
  }

  if (
    scope?.company_id &&
    columns.company &&
    Number(record[columns.company] || 0) !== Number(scope.company_id || 0)
  ) {
    throw new Error('Record does not belong to the active company scope');
  }

  if (
    scope?.branch_id &&
    columns.branch &&
    Number(record[columns.branch] || 0) !== Number(scope.branch_id || 0)
  ) {
    throw new Error('Record does not belong to the active branch scope');
  }

  if (
    scope?.business_unit_id &&
    columns.businessUnit &&
    Number(record[columns.businessUnit] || 0) !== Number(scope.business_unit_id || 0)
  ) {
    throw new Error('Record does not belong to the active business unit scope');
  }

  return true;
};

export const requireDataScope = (req) => {
  const scope = normalizeScope(req?.dataScope || {});

  if (!scope.company_id) {
    const error = new Error(
      'Missing active organization scope. Select a company / branch / business unit first.'
    );
    error.statusCode = 400;
    throw error;
  }

  return scope;
};