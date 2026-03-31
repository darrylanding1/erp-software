import db from '../config/db.js';
import { buildScopeWhereClause } from '../middleware/dataScopeMiddleware.js';

export const getLowStockReport = async (req, res) => {
  try {
    const threshold = Number(req.query.threshold || 10);
    const scope = req.dataScope || {};

    const productScope = buildScopeWhereClause(scope, {
      company: 'p.company_id',
      branch: 'p.branch_id',
      businessUnit: 'p.business_unit_id',
    });

    const stockScope = buildScopeWhereClause(scope, {
      company: 's.company_id',
      branch: 's.branch_id',
      businessUnit: 's.business_unit_id',
    });

    const [rows] = await db.query(
      `
      SELECT
        p.id,
        p.name,
        p.sku,
        COALESCE(SUM(s.quantity), 0) AS quantity,
        CASE
          WHEN COALESCE(SUM(s.quantity), 0) <= 0 THEN 'Out of Stock'
          WHEN COALESCE(SUM(s.quantity), 0) <= ? THEN 'Low Stock'
          ELSE 'In Stock'
        END AS status,
        p.base_price,
        p.market_price,
        p.image_url,
        c.name AS category_name,
        COALESCE(SUM(s.total_value), 0) AS stock_value
      FROM products p
      LEFT JOIN categories c
        ON p.category_id = c.id
      LEFT JOIN inventory_stocks s
        ON s.product_id = p.id
       ${stockScope.sql}
      WHERE 1 = 1 ${productScope.sql}
      GROUP BY
        p.id,
        p.name,
        p.sku,
        p.base_price,
        p.market_price,
        p.image_url,
        c.name
      HAVING COALESCE(SUM(s.quantity), 0) <= ?
      ORDER BY quantity ASC, p.name ASC
      `,
      [threshold, ...stockScope.values, ...productScope.values, threshold]
    );

    res.json(rows);
  } catch (error) {
    console.error('Get low stock report error:', error);
    res.status(500).json({
      message: 'Failed to fetch low stock report',
      error: error.message,
    });
  }
};