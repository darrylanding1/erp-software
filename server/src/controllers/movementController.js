import db from '../config/db.js';
import { createAuditLog, getRequestIp } from '../utils/auditTrail.js';
import {
  getStockStatus,
  increaseWarehouseStock,
  setWarehouseStockQuantity,
  transferWarehouseStock,
} from '../utils/inventoryStock.js';
import {
  buildScopeWhereClause,
  requireDataScope,
} from '../middleware/dataScopeMiddleware.js';

const buildWarehouseScope = (scope, alias = 'w') =>
  buildScopeWhereClause(scope, {
    company: `${alias}.company_id`,
    branch: `${alias}.branch_id`,
    businessUnit: `${alias}.business_unit_id`,
  });

const buildProductScope = (scope, alias = 'p') =>
  buildScopeWhereClause(scope, {
    company: `${alias}.company_id`,
    branch: `${alias}.branch_id`,
    businessUnit: `${alias}.business_unit_id`,
  });

const assertWarehouseInScope = async (connection, warehouseId, scope) => {
  const warehouseScope = buildWarehouseScope(scope, 'w');
  const [rows] = await connection.query(
    `
    SELECT id, name, code, status
    FROM warehouses w
    WHERE w.id = ? ${warehouseScope.sql}
    LIMIT 1
    `,
    [Number(warehouseId), ...warehouseScope.values]
  );

  if (!rows.length) {
    throw new Error('Warehouse not found in the active scope');
  }

  if (rows[0].status !== 'Active') {
    throw new Error('Warehouse is inactive');
  }

  return rows[0];
};

const assertProductInScope = async (connection, productId, scope) => {
  const productScope = buildProductScope(scope, 'p');
  const [rows] = await connection.query(
    `
    SELECT p.id, p.name, p.sku
    FROM products p
    WHERE p.id = ? ${productScope.sql}
    LIMIT 1
    `,
    [Number(productId), ...productScope.values]
  );

  if (!rows.length) {
    throw new Error('Product not found in the active scope');
  }

  return rows[0];
};

export const getMovementMeta = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const warehouseScope = buildWarehouseScope(scope, 'w');

    const [warehouses] = await db.query(
      `
      SELECT id, name, code, address, status
      FROM warehouses w
      WHERE w.status = 'Active' ${warehouseScope.sql}
      ORDER BY w.name ASC
      `,
      warehouseScope.values
    );

    res.json({ warehouses });
  } catch (error) {
    console.error('Get movement meta error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch movement metadata' });
  }
};

export const getStockOverview = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { search = '' } = req.query;
    const warehouseScope = buildWarehouseScope(scope, 'w');
    const productScope = buildProductScope(scope, 'p');

    const [warehouses] = await db.query(
      `
      SELECT id, name, code, address, status
      FROM warehouses w
      WHERE w.status = 'Active' ${warehouseScope.sql}
      ORDER BY w.id ASC
      `,
      warehouseScope.values
    );

    let productSql = `
      SELECT
        p.id,
        p.name,
        p.sku,
        p.category_id,
        p.base_price,
        p.market_price,
        p.image_url,
        p.created_at,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c
        ON p.category_id = c.id
       AND c.company_id = p.company_id
       AND (c.branch_id <=> p.branch_id)
       AND (c.business_unit_id <=> p.business_unit_id)
      WHERE 1 = 1 ${productScope.sql}
    `;
    const productValues = [...productScope.values];

    if (search) {
      productSql += ` AND (p.name LIKE ? OR p.sku LIKE ?)`;
      productValues.push(`%${search}%`, `%${search}%`);
    }

    productSql += ` ORDER BY p.name ASC, p.id DESC`;

    const [products] = await db.query(productSql, productValues);

    const [stockRows] = await db.query(
      `
      SELECT
        s.product_id,
        s.warehouse_id,
        s.quantity
      FROM inventory_stocks s
      INNER JOIN warehouses w ON w.id = s.warehouse_id
      INNER JOIN products p ON p.id = s.product_id
      WHERE 1 = 1 ${warehouseScope.sql} ${productScope.sql}
      `,
      [...warehouseScope.values, ...productScope.values]
    );

    const stockMap = new Map();

    for (const row of stockRows) {
      stockMap.set(`${row.product_id}-${row.warehouse_id}`, Number(row.quantity) || 0);
    }

    const overview = products.map((product) => {
      const warehouse_quantities = {};
      let total_quantity = 0;

      warehouses.forEach((warehouse) => {
        const qty = stockMap.get(`${product.id}-${warehouse.id}`) || 0;
        warehouse_quantities[warehouse.id] = qty;
        total_quantity += qty;
      });

      return {
        ...product,
        warehouse_quantities,
        total_quantity,
        stock_status: getStockStatus(total_quantity),
      };
    });

    res.json({
      warehouses,
      overview,
    });
  } catch (error) {
    console.error('Get stock overview error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch stock overview' });
  }
};

export const getTransfers = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { product_id = '', warehouse_id = '', search = '' } = req.query;
    const productScope = buildProductScope(scope, 'p');
    const fromWarehouseScope = buildWarehouseScope(scope, 'fw');
    const toWarehouseScope = buildWarehouseScope(scope, 'tw');

    let sql = `
      SELECT
        wt.*,
        p.name AS product_name,
        p.sku,
        fw.name AS from_warehouse_name,
        fw.code AS from_warehouse_code,
        tw.name AS to_warehouse_name,
        tw.code AS to_warehouse_code
      FROM warehouse_transfers wt
      INNER JOIN products p ON wt.product_id = p.id
      INNER JOIN warehouses fw ON wt.from_warehouse_id = fw.id
      INNER JOIN warehouses tw ON wt.to_warehouse_id = tw.id
      WHERE 1 = 1 ${productScope.sql} ${fromWarehouseScope.sql} ${toWarehouseScope.sql}
    `;
    const values = [...productScope.values, ...fromWarehouseScope.values, ...toWarehouseScope.values];

    if (product_id) {
      sql += ` AND wt.product_id = ?`;
      values.push(product_id);
    }

    if (warehouse_id) {
      sql += ` AND (wt.from_warehouse_id = ? OR wt.to_warehouse_id = ?)`;
      values.push(warehouse_id, warehouse_id);
    }

    if (search) {
      sql += ` AND (wt.transfer_number LIKE ? OR p.name LIKE ? OR p.sku LIKE ?)`;
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY wt.transfer_date DESC, wt.id DESC`;

    const [rows] = await db.query(sql, values);
    res.json(rows);
  } catch (error) {
    console.error('Get transfers error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch warehouse transfers' });
  }
};

export const createTransfer = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const scope = requireDataScope(req);

    const {
      product_id,
      from_warehouse_id,
      to_warehouse_id,
      quantity,
      transfer_date,
      remarks,
    } = req.body;

    const productId = Number(product_id);
    const fromWarehouseId = Number(from_warehouse_id);
    const toWarehouseId = Number(to_warehouse_id);
    const qty = Number(quantity);

    if (!productId || !fromWarehouseId || !toWarehouseId || !qty || qty <= 0 || !transfer_date) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid transfer data' });
    }

    if (fromWarehouseId === toWarehouseId) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Source and destination warehouse must be different',
      });
    }

    const product = await assertProductInScope(connection, productId, scope);
    await assertWarehouseInScope(connection, fromWarehouseId, scope);
    await assertWarehouseInScope(connection, toWarehouseId, scope);

    let transferResult;

    try {
      transferResult = await transferWarehouseStock(connection, {
        productId,
        fromWarehouseId,
        toWarehouseId,
        quantity: qty,
      });
    } catch (stockError) {
      await connection.rollback();
      return res.status(400).json({ message: stockError.message });
    }

    const fromPrevious = transferResult.from.previousQuantity;
    const fromNew = transferResult.from.newQuantity;
    const toPrevious = transferResult.to.previousQuantity;
    const toNew = transferResult.to.newQuantity;

    await connection.query(
      `
      INSERT INTO stock_movements (
        product_id,
        warehouse_id,
        movement_type,
        reference_type,
        reference_id,
        quantity,
        previous_quantity,
        new_quantity,
        note,
        reference_number,
        created_by,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, 'Transfer Out', 'Transfer', NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
      `,
      [
        productId,
        fromWarehouseId,
        qty,
        fromPrevious,
        fromNew,
        remarks || null,
        req.user?.id || null,
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
      ]
    );

    const [transferInResult] = await connection.query(
      `
      INSERT INTO stock_movements (
        product_id,
        warehouse_id,
        movement_type,
        reference_type,
        reference_id,
        quantity,
        previous_quantity,
        new_quantity,
        note,
        reference_number,
        created_by,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, 'Transfer In', 'Transfer', NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
      `,
      [
        productId,
        toWarehouseId,
        qty,
        toPrevious,
        toNew,
        remarks || null,
        req.user?.id || null,
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
      ]
    );

    await connection.commit();

    await createAuditLog({
      userId: req.user?.id || null,
      action: 'CREATE',
      moduleName: 'Warehouse Transfers',
      recordId: transferInResult.insertId,
      description: `Transferred ${qty} of ${product.name} from warehouse ${fromWarehouseId} to warehouse ${toWarehouseId}`,
      newValues: {
        product_id: productId,
        from_warehouse_id: fromWarehouseId,
        to_warehouse_id: toWarehouseId,
        quantity: qty,
        transfer_date,
        remarks: remarks || null,
        company_id: scope.company_id,
        branch_id: scope.branch_id,
        business_unit_id: scope.business_unit_id,
      },
      ipAddress: getRequestIp(req),
    });

    res.status(201).json({ message: 'Transfer created successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Create transfer error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create transfer' });
  } finally {
    connection.release();
  }
};

export const getMovements = async (req, res) => {
  try {
    const scope = requireDataScope(req);
    const { product_id = '', movement_type = '', warehouse_id = '' } = req.query;
    const movementScope = buildScopeWhereClause(scope, {
      company: 'sm.company_id',
      branch: 'sm.branch_id',
      businessUnit: 'sm.business_unit_id',
    });

    let sql = `
      SELECT
        sm.*,
        p.name AS product_name,
        p.sku,
        w.name AS warehouse_name,
        w.code AS warehouse_code
      FROM stock_movements sm
      INNER JOIN products p ON sm.product_id = p.id
      LEFT JOIN warehouses w ON sm.warehouse_id = w.id
      WHERE 1 = 1 ${movementScope.sql}
    `;
    const values = [...movementScope.values];

    if (product_id) {
      sql += ' AND sm.product_id = ?';
      values.push(product_id);
    }

    if (movement_type) {
      sql += ' AND sm.movement_type = ?';
      values.push(movement_type);
    }

    if (warehouse_id) {
      sql += ' AND sm.warehouse_id = ?';
      values.push(warehouse_id);
    }

    sql += ' ORDER BY sm.created_at DESC, sm.id DESC';

    const [rows] = await db.query(sql, values);
    res.json(rows);
  } catch (error) {
    console.error('Get movements error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to fetch stock movements' });
  }
};

export const createMovement = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const scope = requireDataScope(req);

    const { product_id, warehouse_id, movement_type, quantity, note } = req.body;

    const productId = Number(product_id);
    const warehouseId = Number(warehouse_id);
    const qty = Number(quantity);

    if (!productId || !warehouseId || !movement_type || !qty || qty <= 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Invalid movement data' });
    }

    const product = await assertProductInScope(connection, productId, scope);
    await assertWarehouseInScope(connection, warehouseId, scope);

    let previousQty = 0;
    let newQty = 0;

    try {
      if (movement_type === 'Stock In' || movement_type === 'Restock') {
        const result = await increaseWarehouseStock(connection, {
          productId,
          warehouseId,
          quantity: qty,
        });

        previousQty = result.previousQuantity;
        newQty = result.newQuantity;
      } else if (movement_type === 'Stock Out') {
        const [[stockRow]] = await connection.query(
          `
          SELECT quantity
          FROM inventory_stocks
          WHERE product_id = ? AND warehouse_id = ?
          FOR UPDATE
          `,
          [productId, warehouseId]
        );

        previousQty = Number(stockRow?.quantity || 0);

        if (qty > previousQty) {
          await connection.rollback();
          return res.status(400).json({ message: 'Insufficient stock' });
        }

        newQty = previousQty - qty;

        await connection.query(
          `
          UPDATE inventory_stocks
          SET
            quantity = ?,
            total_value = ROUND(? * COALESCE(unit_cost, 0), 2)
          WHERE product_id = ? AND warehouse_id = ?
          `,
          [newQty, newQty, productId, warehouseId]
        );
      } else if (movement_type === 'Adjustment') {
        const result = await setWarehouseStockQuantity(connection, {
          productId,
          warehouseId,
          newQuantity: qty,
        });

        previousQty = result.previousQuantity;
        newQty = result.newQuantity;
      } else {
        await connection.rollback();
        return res.status(400).json({ message: 'Invalid movement type' });
      }
    } catch (stockError) {
      await connection.rollback();
      return res.status(400).json({ message: stockError.message });
    }

    const [result] = await connection.query(
      `
      INSERT INTO stock_movements (
        product_id,
        warehouse_id,
        movement_type,
        reference_type,
        reference_id,
        quantity,
        previous_quantity,
        new_quantity,
        note,
        reference_number,
        created_by,
        company_id,
        branch_id,
        business_unit_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        productId,
        warehouseId,
        movement_type,
        'Manual',
        null,
        qty,
        previousQty,
        newQty,
        note || null,
        null,
        req.user?.id || null,
        scope.company_id,
        scope.branch_id,
        scope.business_unit_id,
      ]
    );

    await connection.commit();

    const movementRecord = {
      id: result.insertId,
      product_id: productId,
      warehouse_id: warehouseId,
      movement_type,
      quantity: qty,
      previous_quantity: previousQty,
      new_quantity: newQty,
      note: note || null,
      company_id: scope.company_id,
      branch_id: scope.branch_id,
      business_unit_id: scope.business_unit_id,
    };

    await createAuditLog({
      userId: req.user?.id || null,
      action: 'CREATE',
      moduleName: 'Stock Movements',
      recordId: movementRecord.id,
      description: `${movement_type} for product ${product.name} (${product.sku})`,
      newValues: movementRecord,
      ipAddress: getRequestIp(req),
    });

    res.status(201).json({
      message: 'Stock movement created successfully',
      movement: movementRecord,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create movement error:', error);
    res.status(error.statusCode || 500).json({ message: error.message || 'Failed to create stock movement' });
  } finally {
    connection.release();
  }
};
