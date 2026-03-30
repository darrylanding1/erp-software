import db from '../config/db.js';
import { buildScopeWhereClause } from '../middleware/dataScopeMiddleware.js';

export const getDashboardData = async (req, res) => {
  try {
    const scope = req.dataScope;
    const productScope = buildScopeWhereClause(scope);
    const categoryScope = buildScopeWhereClause(scope);
    const stockScope = buildScopeWhereClause(scope);
    const movementScope = buildScopeWhereClause(scope);

    const [[productsCount]] = await db.query(
      `
      SELECT COUNT(*) AS totalProducts
      FROM products
      WHERE 1 = 1 ${productScope.sql}
      `,
      productScope.values
    );

    const [[lowStockCount]] = await db.query(
      `
      SELECT COUNT(*) AS lowStockCount
      FROM (
        SELECT
          p.id,
          COALESCE(SUM(s.quantity), 0) AS total_quantity,
          COALESCE(NULLIF(p.reorder_point, 0), 10) AS effective_reorder_point
        FROM products p
        LEFT JOIN inventory_stocks s
          ON s.product_id = p.id
          ${stockScope.sql.replace(/ AND /g, ' AND s.')}
        WHERE 1 = 1 ${productScope.sql}
        GROUP BY p.id, p.reorder_point
      ) x
      WHERE x.total_quantity > 0
        AND x.total_quantity <= x.effective_reorder_point
      `,
      [...stockScope.values, ...productScope.values]
    );

    const [[criticalStockCount]] = await db.query(
      `
      SELECT COUNT(*) AS criticalStockCount
      FROM (
        SELECT
          p.id,
          COALESCE(SUM(s.quantity), 0) AS total_quantity
        FROM products p
        LEFT JOIN inventory_stocks s
          ON s.product_id = p.id
          ${stockScope.sql.replace(/ AND /g, ' AND s.')}
        WHERE 1 = 1 ${productScope.sql}
        GROUP BY p.id
      ) x
      WHERE x.total_quantity > 0 AND x.total_quantity <= 5
      `,
      [...stockScope.values, ...productScope.values]
    );

    const [[categoriesCount]] = await db.query(
      `
      SELECT COUNT(*) AS totalCategories
      FROM categories
      WHERE 1 = 1 ${categoryScope.sql}
      `,
      categoryScope.values
    );

    let totalUsers = 0;

    try {
      const [[usersCount]] = await db.query(
        'SELECT COUNT(*) AS totalUsers FROM users'
      );
      totalUsers = usersCount.totalUsers;
    } catch (error) {
      totalUsers = 0;
    }

    const [lowStockItems] = await db.query(
      `
      SELECT
        p.id,
        p.name,
        p.sku,
        COALESCE(SUM(s.quantity), 0) AS quantity,
        CASE
          WHEN COALESCE(SUM(s.quantity), 0) <= 0 THEN 'Out of Stock'
          WHEN COALESCE(SUM(s.quantity), 0) <= COALESCE(NULLIF(p.reorder_point, 0), 10) THEN 'Low Stock'
          ELSE 'In Stock'
        END AS status,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory_stocks s
        ON s.product_id = p.id
        ${stockScope.sql.replace(/ AND /g, ' AND s.')}
      WHERE 1 = 1 ${productScope.sql}
      GROUP BY p.id, p.name, p.sku, c.name, p.reorder_point
      HAVING COALESCE(SUM(s.quantity), 0) <= COALESCE(NULLIF(p.reorder_point, 0), 10)
      ORDER BY quantity ASC, p.name ASC
      LIMIT 6
      `,
      [...stockScope.values, ...productScope.values]
    );

    const [recentActions] = await db.query(
      `
      SELECT
        sm.id,
        sm.movement_type,
        sm.reference_type,
        sm.reference_id,
        sm.quantity,
        sm.previous_quantity,
        sm.new_quantity,
        sm.note,
        sm.created_at,
        p.name AS product_name,
        p.sku
      FROM stock_movements sm
      INNER JOIN products p ON sm.product_id = p.id
      WHERE 1 = 1 ${movementScope.sql.replace(/ AND /g, ' AND sm.')}
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT 6
      `,
      movementScope.values
    );

    res.json({
      totalProducts: productsCount.totalProducts,
      lowStockCount: lowStockCount.lowStockCount,
      criticalStockCount: criticalStockCount.criticalStockCount,
      totalCategories: categoriesCount.totalCategories,
      totalUsers,
      lowStockItems,
      recentActions,
    });
  } catch (error) {
    console.error('Get dashboard data error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard data' });
  }
};