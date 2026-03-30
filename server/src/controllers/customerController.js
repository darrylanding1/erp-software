import db from '../config/db.js';
import {
  applyDataScopeFilter,
  assertScopeMatch,
} from '../middleware/dataScopeMiddleware.js';

const mapScopeInsert = (scope) => ({
  company_id: scope?.company_id ?? null,
  branch_id: scope?.branch_id ?? null,
  business_unit_id: scope?.business_unit_id ?? null,
});

export const getCustomers = async (req, res) => {
  try {
    const { search = '' } = req.query;

    let query = applyDataScopeFilter({
      baseSql: `
        SELECT
          id,
          customer_code,
          name,
          contact_person,
          email,
          phone,
          address,
          status,
          company_id,
          branch_id,
          business_unit_id,
          created_at,
          updated_at
        FROM customers
        WHERE 1 = 1
      `,
      scope: req.dataScope,
    });

    if (search) {
      query.sql += `
        AND (
          customer_code LIKE ?
          OR name LIKE ?
          OR contact_person LIKE ?
          OR email LIKE ?
          OR phone LIKE ?
        )
      `;
      query.values.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      );
    }

    query.sql += ` ORDER BY name ASC`;

    const [rows] = await db.query(query.sql, query.values);
    res.json(rows);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ message: 'Failed to fetch customers' });
  }
};

export const getCustomerById = async (req, res) => {
  try {
    const customerId = Number(req.params.id);

    if (!customerId) {
      return res.status(400).json({ message: 'Invalid customer id' });
    }

    const [[row]] = await db.query(
      `
      SELECT
        id,
        customer_code,
        name,
        contact_person,
        email,
        phone,
        address,
        status,
        company_id,
        branch_id,
        business_unit_id,
        created_at,
        updated_at
      FROM customers
      WHERE id = ?
      LIMIT 1
      `,
      [customerId]
    );

    if (!row) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    assertScopeMatch(row, req.dataScope);
    res.json(row);
  } catch (error) {
    console.error('Get customer by id error:', error);

    if (error.message?.includes('scope')) {
      return res.status(403).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to fetch customer' });
  }
};

export const createCustomer = async (req, res) => {
  try {
    const {
      customer_code,
      name,
      contact_person = null,
      email = null,
      phone = null,
      address = null,
      status = 'Active',
    } = req.body;

    if (!customer_code || !name) {
      return res.status(400).json({
        message: 'customer_code and name are required',
      });
    }

    const scope = mapScopeInsert(req.dataScope);

    const [result] = await db.query(
      `
      INSERT INTO customers
      (
        customer_code,
        name,
        contact_person,
        email,
        phone,
        address,
        status,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        customer_code,
        name,
        contact_person,
        email,
        phone,
        address,
        status,
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
      ]
    );

    const [[row]] = await db.query(
      `
      SELECT
        id,
        customer_code,
        name,
        contact_person,
        email,
        phone,
        address,
        status,
        company_id,
        branch_id,
        business_unit_id,
        created_at,
        updated_at
      FROM customers
      WHERE id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    res.status(201).json(row);
  } catch (error) {
    console.error('Create customer error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Customer code already exists' });
    }

    res.status(500).json({ message: 'Failed to create customer' });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const customerId = Number(req.params.id);

    if (!customerId) {
      return res.status(400).json({ message: 'Invalid customer id' });
    }

    const {
      customer_code,
      name,
      contact_person = null,
      email = null,
      phone = null,
      address = null,
      status = 'Active',
    } = req.body;

    if (!customer_code || !name) {
      return res.status(400).json({
        message: 'customer_code and name are required',
      });
    }

    const [[existingRow]] = await db.query(
      `
      SELECT *
      FROM customers
      WHERE id = ?
      LIMIT 1
      `,
      [customerId]
    );

    if (!existingRow) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    assertScopeMatch(existingRow, req.dataScope);

    const [result] = await db.query(
      `
      UPDATE customers
      SET
        customer_code = ?,
        name = ?,
        contact_person = ?,
        email = ?,
        phone = ?,
        address = ?,
        status = ?
      WHERE id = ?
      `,
      [
        customer_code,
        name,
        contact_person,
        email,
        phone,
        address,
        status,
        customerId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const [[row]] = await db.query(
      `
      SELECT
        id,
        customer_code,
        name,
        contact_person,
        email,
        phone,
        address,
        status,
        company_id,
        branch_id,
        business_unit_id,
        created_at,
        updated_at
      FROM customers
      WHERE id = ?
      LIMIT 1
      `,
      [customerId]
    );

    res.json(row);
  } catch (error) {
    console.error('Update customer error:', error);

    if (error.message?.includes('scope')) {
      return res.status(403).json({ message: error.message });
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Customer code already exists' });
    }

    res.status(500).json({ message: 'Failed to update customer' });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const customerId = Number(req.params.id);

    if (!customerId) {
      return res.status(400).json({ message: 'Invalid customer id' });
    }

    const [[customerRow]] = await db.query(
      `
      SELECT *
      FROM customers
      WHERE id = ?
      LIMIT 1
      `,
      [customerId]
    );

    if (!customerRow) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    assertScopeMatch(customerRow, req.dataScope);

    const invoiceQuery = applyDataScopeFilter({
      baseSql: `
        SELECT id
        FROM sales_invoices
        WHERE customer_id = ?
      `,
      baseValues: [customerId],
      scope: req.dataScope,
    });

    invoiceQuery.sql += ' LIMIT 1';

    const [invoiceRow] = await db.query(invoiceQuery.sql, invoiceQuery.values);

    if (invoiceRow.length > 0) {
      return res.status(400).json({
        message:
          'This customer already has sales invoices. Set it inactive instead of deleting.',
      });
    }

    const [result] = await db.query(
      `
      DELETE FROM customers
      WHERE id = ?
      `,
      [customerId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Delete customer error:', error);

    if (error.message?.includes('scope')) {
      return res.status(403).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to delete customer' });
  }
};