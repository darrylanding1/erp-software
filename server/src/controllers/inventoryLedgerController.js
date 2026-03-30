import db from '../config/db.js';

export const getInventoryLedger = async (req, res) => {
  try {
    const { product_id = '', warehouse_id = '', reference_type = '' } = req.query;

    let sql = `
      SELECT
        il.*,
        p.name AS product_name,
        p.sku,
        w.name AS warehouse_name
      FROM inventory_ledger il
      INNER JOIN products p ON p.id = il.product_id
      INNER JOIN warehouses w ON w.id = il.warehouse_id
      WHERE 1 = 1
    `;
    const params = [];

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
    res.status(500).json({ message: 'Failed to fetch inventory ledger' });
  }
};
