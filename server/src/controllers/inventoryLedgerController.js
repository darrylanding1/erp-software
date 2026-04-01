import db from '../config/db.js';
import {
  buildScopeWhereClause,
  requireDataScope,
} from '../middleware/dataScopeMiddleware.js';

export const getInventoryLedger = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { product_id = '', warehouse_id = '', reference_type = '' } = req.query;

    const productScope = buildScopeWhereClause(scope, {
      company: 'p.company_id',
      branch: 'p.branch_id',
      businessUnit: 'p.business_unit_id',
    });

    const warehouseScope = buildScopeWhereClause(scope, {
      company: 'w.company_id',
      branch: 'w.branch_id',
      businessUnit: 'w.business_unit_id',
    });

    let sql = `
      SELECT
        il.*,
        p.name AS product_name,
        p.sku,
        w.name AS warehouse_name
      FROM inventory_ledger il
      INNER JOIN products p ON p.id = il.product_id
      INNER JOIN warehouses w ON w.id = il.warehouse_id
      WHERE 1 = 1 ${productScope.sql} ${warehouseScope.sql}
    `;
    const params = [...productScope.values, ...warehouseScope.values];

    if (product_id) {
      sql += ' AND il.product_id = ?';
      params.push(product_id);
    }

    if (warehouse_id) {
      sql += ' AND il.warehouse_id = ?';
      params.push(warehouse_id);
    }

    if (reference_type) {
      sql += ' AND il.reference_type = ?';
      params.push(reference_type);
    }

    sql += ' ORDER BY il.posting_date DESC, il.id DESC';

    const [rows] = await db.query(sql, params);

    res.json(rows);
  } catch (error) {
    console.error('Get inventory ledger error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch inventory ledger' });
  }
};