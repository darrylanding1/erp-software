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

export const getSuppliers = async (req, res) => {
  try {
    const { search = '', status = '' } = req.query;

    let query = applyDataScopeFilter({
      baseSql: `
        SELECT *
        FROM suppliers
        WHERE 1 = 1
      `,
      scope: req.dataScope,
    });

    if (search) {
      query.sql += ' AND (name LIKE ? OR contact_person LIKE ? OR email LIKE ? OR phone LIKE ?)';
      query.values.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (status) {
      query.sql += ' AND status = ?';
      query.values.push(status);
    }

    query.sql += ' ORDER BY id DESC';

    const [rows] = await db.query(query.sql, query.values);
    res.json(rows);
  } catch (error) {
    console.error('Get suppliers error:', error);
    res.status(500).json({ message: 'Failed to fetch suppliers' });
  }
};

export const getSupplierById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query('SELECT * FROM suppliers WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    assertScopeMatch(rows[0], req.dataScope);

    res.json(rows[0]);
  } catch (error) {
    console.error('Get supplier by id error:', error);

    if (error.message?.includes('scope')) {
      return res.status(403).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to fetch supplier' });
  }
};

export const createSupplier = async (req, res) => {
  try {
    const { name, contact_person, email, phone, address, status } = req.body;
    const scope = mapScopeInsert(req.dataScope);

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    const [result] = await db.query(
      `
      INSERT INTO suppliers (
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        name.trim(),
        contact_person?.trim() || null,
        email?.trim() || null,
        phone?.trim() || null,
        address?.trim() || null,
        status || 'Active',
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
      ]
    );

    const [rows] = await db.query('SELECT * FROM suppliers WHERE id = ?', [result.insertId]);

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Create supplier error:', error);
    res.status(500).json({ message: 'Failed to create supplier' });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact_person, email, phone, address, status } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    const [existingRows] = await db.query('SELECT * FROM suppliers WHERE id = ?', [id]);

    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    assertScopeMatch(existingRows[0], req.dataScope);

    await db.query(
      `
      UPDATE suppliers
      SET
        name = ?,
        contact_person = ?,
        email = ?,
        phone = ?,
        address = ?,
        status = ?
      WHERE id = ?
      `,
      [
        name.trim(),
        contact_person?.trim() || null,
        email?.trim() || null,
        phone?.trim() || null,
        address?.trim() || null,
        status || 'Active',
        id,
      ]
    );

    const [rows] = await db.query('SELECT * FROM suppliers WHERE id = ?', [id]);

    res.json(rows[0]);
  } catch (error) {
    console.error('Update supplier error:', error);

    if (error.message?.includes('scope')) {
      return res.status(403).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to update supplier' });
  }
};

export const deleteSupplier = async (req, res) => {
  try {
    const { id } = req.params;

    const [existingRows] = await db.query('SELECT * FROM suppliers WHERE id = ?', [id]);

    if (existingRows.length === 0) {
      return res.status(404).json({ message: 'Supplier not found' });
    }

    assertScopeMatch(existingRows[0], req.dataScope);

    const poQuery = applyDataScopeFilter({
      baseSql: `
        SELECT id
        FROM purchase_orders
        WHERE supplier_id = ?
      `,
      baseValues: [id],
      scope: req.dataScope,
    });

    poQuery.sql += ' LIMIT 1';

    const [poRows] = await db.query(poQuery.sql, poQuery.values);

    if (poRows.length > 0) {
      return res.status(400).json({
        message: 'Cannot delete supplier because it is already used in purchase orders',
      });
    }

    await db.query('DELETE FROM suppliers WHERE id = ?', [id]);

    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Delete supplier error:', error);

    if (error.message?.includes('scope')) {
      return res.status(403).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to delete supplier' });
  }
};