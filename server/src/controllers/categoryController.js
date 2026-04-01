import db from '../config/db.js';
import {
  applyDataScopeFilter,
  assertScopeMatch,
  requireDataScope,
} from '../middleware/dataScopeMiddleware.js';

const mapScopeInsert = (scope) => ({
  company_id: scope?.company_id ?? null,
  branch_id: scope?.branch_id ?? null,
  business_unit_id: scope?.business_unit_id ?? null,
});

export const getCategories = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { search = '' } = req.query;

    let query = applyDataScopeFilter({
      baseSql: `
        SELECT *
        FROM categories
        WHERE 1 = 1
      `,
      scope,
    });

    if (search) {
      query.sql += ` AND (name LIKE ? OR description LIKE ?)`;
      query.values.push(`%${search}%`, `%${search}%`);
    }

    query.sql += ' ORDER BY name ASC';

    const [rows] = await db.query(query.sql, query.values);
    res.json(rows);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;
    const scope = mapScopeInsert(requireDataScope(req));

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const [result] = await db.query(
      `
      INSERT INTO categories (
        name,
        description,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        name.trim(),
        description?.trim() || null,
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
      ]
    );

    const [rows] = await db.query(
      `
      SELECT *
      FROM categories
      WHERE id = ?
        AND company_id = ?
        AND (? IS NULL OR branch_id <=> ?)
        AND (? IS NULL OR business_unit_id <=> ?)
      `,
      [
        result.insertId,
        scope.company_id,
        scope.branch_id,
        scope.branch_id,
        scope.business_unit_id,
        scope.business_unit_id,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Create category error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Category already exists' });
    }

    res.status(500).json({ message: 'Failed to create category' });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const [rows] = await db.query('SELECT * FROM categories WHERE id = ?', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    assertScopeMatch(rows[0], scope);

    await db.query(
      `
      UPDATE categories
      SET name = ?, description = ?
      WHERE id = ?
      `,
      [name.trim(), description?.trim() || null, id]
    );

    const [updatedRows] = await db.query('SELECT * FROM categories WHERE id = ?', [id]);

    res.json(updatedRows[0]);
  } catch (error) {
    console.error('Update category error:', error);

    if (error.message?.includes('scope')) {
      return res.status(403).json({ message: error.message });
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Category already exists' });
    }

    res.status(500).json({ message: 'Failed to update category' });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { id } = req.params;

    const [categoryRows] = await db.query('SELECT * FROM categories WHERE id = ?', [id]);

    if (categoryRows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    assertScopeMatch(categoryRows[0], scope);

    const usedQuery = applyDataScopeFilter({
      baseSql: `
        SELECT COUNT(*) AS total
        FROM products
        WHERE category_id = ?
      `,
      baseValues: [id],
      scope,
    });

    const [usedRows] = await db.query(usedQuery.sql, usedQuery.values);

    if (usedRows[0].total > 0) {
      return res.status(400).json({
        message: 'Cannot delete category because it is used by products',
      });
    }

    const [result] = await db.query('DELETE FROM categories WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);

    if (error.message?.includes('scope')) {
      return res.status(403).json({ message: error.message });
    }

    res.status(500).json({ message: 'Failed to delete category' });
  }
};
