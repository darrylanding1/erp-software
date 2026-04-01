import db from '../config/db.js';
import { requireDataScope } from '../middleware/dataScopeMiddleware.js';

export const getLowStockReport = async (req, res) => {
  try {
    console.log('LOW_STOCK_REPORT_VERSION=2026-03-31-FIX-2');

    const threshold = Number(req.query.threshold || 10);
    const { company_id, branch_id, business_unit_id } = requireDataScope(req);

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
       AND c.company_id = ?
       AND c.branch_id = ?
       AND c.business_unit_id = ?
      LEFT JOIN inventory_stocks s
        ON s.product_id = p.id
       AND s.company_id = ?
       AND s.branch_id = ?
       AND s.business_unit_id = ?
      WHERE p.company_id = ?
        AND p.branch_id = ?
        AND p.business_unit_id = ?
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
      [
        threshold,
        company_id,
        branch_id,
        business_unit_id,
        company_id,
        branch_id,
        business_unit_id,
        company_id,
        branch_id,
        business_unit_id,
        threshold,
      ]
    );

    const summary = rows.reduce(
      (acc, item) => {
        acc.totalItems += 1;
        acc.totalUnits += Number(item.quantity || 0);
        acc.totalStockValue += Number(item.stock_value || 0);
        return acc;
      },
      {
        totalItems: 0,
        totalUnits: 0,
        totalStockValue: 0,
      }
    );

    res.json({
      summary,
      items: rows,
    });
  } catch (error) {
    console.error('Get low stock report error:', error);
    res.status(500).json({
      message: 'Failed to fetch low stock report',
      error: error.message,
    });
  }
};