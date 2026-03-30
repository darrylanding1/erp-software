import db from '../config/db.js';
import { createAuditLog, getRequestIp } from '../utils/auditTrail.js';
import {
  getDefaultUserScope,
  getOrganizationTree,
  getUserScopeAssignments,
  normalizeScope,
  validateOrganizationRelation,
} from '../services/organizationService.js';

export const getOrganizationMeta = async (req, res) => {
  try {
    const [tree, userScopes, defaultScope] = await Promise.all([
      getOrganizationTree(),
      getUserScopeAssignments(req.user.id),
      getDefaultUserScope(req.user.id),
    ]);

    res.json({
      tree,
      my_scopes: userScopes,
      default_scope: defaultScope,
    });
  } catch (error) {
    console.error('Get organization meta error:', error);
    res.status(500).json({ message: 'Failed to fetch organization metadata' });
  }
};

export const createCompany = async (req, res) => {
  try {
    const {
      company_code,
      name,
      legal_name = null,
      tax_id = null,
      base_currency = 'PHP',
      country_code = 'PH',
      status = 'Active',
    } = req.body;

    if (!company_code || !name) {
      return res.status(400).json({ message: 'Company code and name are required' });
    }

    const [result] = await db.query(
      `
      INSERT INTO companies (
        company_code,
        name,
        legal_name,
        tax_id,
        base_currency,
        country_code,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [company_code, name, legal_name, tax_id, base_currency, country_code, status]
    );

    const [[company]] = await db.query(`SELECT * FROM companies WHERE id = ?`, [result.insertId]);

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      moduleName: 'Organization',
      recordId: company.id,
      description: `Created company ${company.name}`,
      newValues: company,
      ipAddress: getRequestIp(req),
    });

    res.status(201).json(company);
  } catch (error) {
    console.error('Create company error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Company code or name already exists' });
    }

    res.status(500).json({ message: 'Failed to create company' });
  }
};

export const createBranch = async (req, res) => {
  try {
    const { company_id, branch_code, name, address = null, status = 'Active' } = req.body;

    if (!company_id || !branch_code || !name) {
      return res.status(400).json({
        message: 'Company, branch code, and branch name are required',
      });
    }

    await validateOrganizationRelation({ company_id, branch_id: null, business_unit_id: null });

    const [result] = await db.query(
      `
      INSERT INTO branches (
        company_id,
        branch_code,
        name,
        address,
        status
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [company_id, branch_code, name, address, status]
    );

    const [[branch]] = await db.query(`SELECT * FROM branches WHERE id = ?`, [result.insertId]);

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      moduleName: 'Organization',
      recordId: branch.id,
      description: `Created branch ${branch.name}`,
      newValues: branch,
      ipAddress: getRequestIp(req),
    });

    res.status(201).json(branch);
  } catch (error) {
    console.error('Create branch error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Branch code or name already exists in this company' });
    }

    if (error.message) {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to create branch' });
  }
};

export const createBusinessUnit = async (req, res) => {
  try {
    const {
      company_id,
      branch_id = null,
      unit_code,
      name,
      status = 'Active',
    } = req.body;

    if (!company_id || !unit_code || !name) {
      return res.status(400).json({
        message: 'Company, business unit code, and business unit name are required',
      });
    }

    await validateOrganizationRelation({
      company_id,
      branch_id,
      business_unit_id: null,
    });

    const [result] = await db.query(
      `
      INSERT INTO business_units (
        company_id,
        branch_id,
        unit_code,
        name,
        status
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [company_id, branch_id, unit_code, name, status]
    );

    const [[businessUnit]] = await db.query(
      `SELECT * FROM business_units WHERE id = ?`,
      [result.insertId]
    );

    await createAuditLog({
      userId: req.user.id,
      action: 'CREATE',
      moduleName: 'Organization',
      recordId: businessUnit.id,
      description: `Created business unit ${businessUnit.name}`,
      newValues: businessUnit,
      ipAddress: getRequestIp(req),
    });

    res.status(201).json(businessUnit);
  } catch (error) {
    console.error('Create business unit error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res
        .status(400)
        .json({ message: 'Business unit code or name already exists in this company' });
    }

    if (error.message) {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to create business unit' });
  }
};

export const getUserOrganizationScopes = async (req, res) => {
  try {
    const userId = Number(req.params.userId);

    if (!userId) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const [scopes, defaultScope] = await Promise.all([
      getUserScopeAssignments(userId),
      getDefaultUserScope(userId),
    ]);

    res.json({
      scopes,
      default_scope: defaultScope,
    });
  } catch (error) {
    console.error('Get user scopes error:', error);
    res.status(500).json({ message: 'Failed to fetch user scopes' });
  }
};

export const assignUserOrganizationScope = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const userId = Number(req.params.userId);
    const scope = normalizeScope(req.body);
    const isDefault = Number(req.body.is_default || 0) === 1;

    if (!userId) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    await validateOrganizationRelation(scope);

    await connection.beginTransaction();

    const [[user]] = await connection.query(
      `
      SELECT id, full_name, email
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!user) {
      await connection.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    const [existing] = await connection.query(
      `
      SELECT id
      FROM user_scope_assignments
      WHERE user_id = ?
        AND company_id = ?
        AND (
          (branch_id IS NULL AND ? IS NULL) OR branch_id = ?
        )
        AND (
          (business_unit_id IS NULL AND ? IS NULL) OR business_unit_id = ?
        )
      LIMIT 1
      `,
      [
        userId,
        scope.company_id,
        scope.branch_id,
        scope.branch_id,
        scope.business_unit_id,
        scope.business_unit_id,
      ]
    );

    if (existing.length === 0) {
      await connection.query(
        `
        INSERT INTO user_scope_assignments (
          user_id,
          company_id,
          branch_id,
          business_unit_id,
          is_default
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          userId,
          scope.company_id,
          scope.branch_id,
          scope.business_unit_id,
          isDefault ? 1 : 0,
        ]
      );
    }

    if (isDefault) {
      await connection.query(
        `
        UPDATE user_scope_assignments
        SET is_default = 0
        WHERE user_id = ?
        `,
        [userId]
      );

      await connection.query(
        `
        UPDATE user_scope_assignments
        SET is_default = 1
        WHERE user_id = ?
          AND company_id = ?
          AND (
            (branch_id IS NULL AND ? IS NULL) OR branch_id = ?
          )
          AND (
            (business_unit_id IS NULL AND ? IS NULL) OR business_unit_id = ?
          )
        `,
        [
          userId,
          scope.company_id,
          scope.branch_id,
          scope.branch_id,
          scope.business_unit_id,
          scope.business_unit_id,
        ]
      );

      await connection.query(
        `
        UPDATE users
        SET
          default_company_id = ?,
          default_branch_id = ?,
          default_business_unit_id = ?
        WHERE id = ?
        `,
        [scope.company_id, scope.branch_id, scope.business_unit_id, userId]
      );
    }

    await connection.commit();

    const scopes = await getUserScopeAssignments(userId);

    await createAuditLog({
      userId: req.user.id,
      action: 'UPDATE',
      moduleName: 'Organization',
      recordId: userId,
      description: `Assigned organization scope to user ${user.full_name}`,
      newValues: {
        assigned_scope: scope,
        is_default: isDefault,
      },
      ipAddress: getRequestIp(req),
    });

    res.json({
      message: 'User scope assigned successfully',
      scopes,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Assign user scope error:', error);

    if (error.message) {
      return res.status(400).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to assign user scope' });
  } finally {
    connection.release();
  }
};