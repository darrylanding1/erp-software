import db from '../config/db.js';

const round4 = (value) => Number(Number(value || 0).toFixed(4));

const parsePositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const ceilToMultiple = (quantity, multiple) => {
  const qty = round4(quantity);
  const mult = round4(multiple);

  if (mult <= 0) return qty;
  return round4(Math.ceil(qty / mult) * mult);
};

const getNextRunNumber = async (connection) => {
  const [rows] = await connection.query(
    `
    SELECT run_number
    FROM mrp_runs
    ORDER BY id DESC
    LIMIT 1
    `
  );

  if (!rows.length || !rows[0].run_number) {
    return 'MRP-00001';
  }

  const currentNumber = rows[0].run_number;
  const numericPart = Number(String(currentNumber).split('-').pop() || 0) + 1;
  return `MRP-${String(numericPart).padStart(5, '0')}`;
};

export const getMrpMetaService = async () => {
  const [products] = await db.query(
    `
    SELECT id, sku, name, status
    FROM products
    ORDER BY name ASC
    `
  );

  const [warehouses] = await db.query(
    `
    SELECT id, code, name, status
    FROM warehouses
    WHERE status = 'Active'
    ORDER BY name ASC
    `
  );

  const [suppliers] = await db.query(
    `
    SELECT id, name, status
    FROM suppliers
    ORDER BY name ASC
    `
  );

  return { products, warehouses, suppliers };
};

export const getMrpPoliciesService = async (filters = {}) => {
  const { warehouse_id = '', product_id = '', supplier_id = '', is_active = '' } = filters;

  let sql = `
    SELECT
      rp.*,
      p.name AS product_name,
      p.sku,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      s.name AS supplier_name,
      creator.full_name AS created_by_name,
      updater.full_name AS updated_by_name
    FROM replenishment_policies rp
    INNER JOIN products p
      ON p.id = rp.product_id
    INNER JOIN warehouses w
      ON w.id = rp.warehouse_id
    LEFT JOIN suppliers s
      ON s.id = rp.supplier_id
    LEFT JOIN users creator
      ON creator.id = rp.created_by
    LEFT JOIN users updater
      ON updater.id = rp.updated_by
    WHERE 1 = 1
  `;
  const values = [];

  if (warehouse_id) {
    sql += ` AND rp.warehouse_id = ?`;
    values.push(Number(warehouse_id));
  }

  if (product_id) {
    sql += ` AND rp.product_id = ?`;
    values.push(Number(product_id));
  }

  if (supplier_id) {
    sql += ` AND rp.supplier_id = ?`;
    values.push(Number(supplier_id));
  }

  if (is_active !== '') {
    sql += ` AND rp.is_active = ?`;
    values.push(Number(is_active) ? 1 : 0);
  }

  sql += ` ORDER BY p.name ASC, w.name ASC`;

  const [rows] = await db.query(sql, values);
  return rows;
};

export const upsertMrpPolicyService = async (connection, payload, userId) => {
  const {
    product_id,
    warehouse_id,
    supplier_id = null,
    reorder_point_qty = 0,
    safety_stock_qty = 0,
    min_stock_qty = 0,
    max_stock_qty = 0,
    reorder_qty = 0,
    lead_time_days = 0,
    coverage_days = 30,
    order_multiple_qty = 0,
    min_order_qty = 0,
    is_active = 1,
    notes = null,
  } = payload;

  if (!product_id || !warehouse_id) {
    throw new Error('product_id and warehouse_id are required');
  }

  const [[product]] = await connection.query(
    `
    SELECT id, name, sku
    FROM products
    WHERE id = ?
    LIMIT 1
    `,
    [Number(product_id)]
  );

  if (!product) {
    throw new Error('Product not found');
  }

  const [[warehouse]] = await connection.query(
    `
    SELECT id, name, code
    FROM warehouses
    WHERE id = ?
    LIMIT 1
    `,
    [Number(warehouse_id)]
  );

  if (!warehouse) {
    throw new Error('Warehouse not found');
  }

  if (supplier_id) {
    const [[supplier]] = await connection.query(
      `
      SELECT id
      FROM suppliers
      WHERE id = ?
      LIMIT 1
      `,
      [Number(supplier_id)]
    );

    if (!supplier) {
      throw new Error('Supplier not found');
    }
  }

  await connection.query(
    `
    INSERT INTO replenishment_policies (
      product_id,
      warehouse_id,
      supplier_id,
      reorder_point_qty,
      safety_stock_qty,
      min_stock_qty,
      max_stock_qty,
      reorder_qty,
      lead_time_days,
      coverage_days,
      order_multiple_qty,
      min_order_qty,
      is_active,
      notes,
      created_by,
      updated_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      supplier_id = VALUES(supplier_id),
      reorder_point_qty = VALUES(reorder_point_qty),
      safety_stock_qty = VALUES(safety_stock_qty),
      min_stock_qty = VALUES(min_stock_qty),
      max_stock_qty = VALUES(max_stock_qty),
      reorder_qty = VALUES(reorder_qty),
      lead_time_days = VALUES(lead_time_days),
      coverage_days = VALUES(coverage_days),
      order_multiple_qty = VALUES(order_multiple_qty),
      min_order_qty = VALUES(min_order_qty),
      is_active = VALUES(is_active),
      notes = VALUES(notes),
      updated_by = VALUES(updated_by),
      updated_at = CURRENT_TIMESTAMP()
    `,
    [
      Number(product_id),
      Number(warehouse_id),
      supplier_id ? Number(supplier_id) : null,
      round4(reorder_point_qty),
      round4(safety_stock_qty),
      round4(min_stock_qty),
      round4(max_stock_qty),
      round4(reorder_qty),
      Number(lead_time_days || 0),
      Number(coverage_days || 30),
      round4(order_multiple_qty),
      round4(min_order_qty),
      Number(is_active) ? 1 : 0,
      notes,
      userId || null,
      userId || null,
    ]
  );

  const [[saved]] = await connection.query(
    `
    SELECT
      rp.*,
      p.name AS product_name,
      p.sku,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      s.name AS supplier_name
    FROM replenishment_policies rp
    INNER JOIN products p
      ON p.id = rp.product_id
    INNER JOIN warehouses w
      ON w.id = rp.warehouse_id
    LEFT JOIN suppliers s
      ON s.id = rp.supplier_id
    WHERE rp.product_id = ?
      AND rp.warehouse_id = ?
    LIMIT 1
    `,
    [Number(product_id), Number(warehouse_id)]
  );

  return {
    message: 'Replenishment policy saved successfully',
    item: saved,
  };
};

const getDemandHistoryMap = async ({ productIds, warehouseIds, lookbackDays = 30 }) => {
  if (!productIds.length || !warehouseIds.length) {
    return new Map();
  }

  const placeholdersProducts = productIds.map(() => '?').join(', ');
  const placeholdersWarehouses = warehouseIds.map(() => '?').join(', ');

  const [rows] = await db.query(
    `
    SELECT
      soi.product_id,
      so.warehouse_id,
      COALESCE(SUM(soi.quantity), 0) AS demand_qty
    FROM sales_order_items soi
    INNER JOIN sales_orders so
      ON so.id = soi.sales_order_id
    WHERE so.status IN ('Approved', 'Partially Invoiced', 'Fully Invoiced')
      AND so.order_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      AND soi.product_id IN (${placeholdersProducts})
      AND so.warehouse_id IN (${placeholdersWarehouses})
    GROUP BY soi.product_id, so.warehouse_id
    `,
    [Number(lookbackDays), ...productIds, ...warehouseIds]
  );

  const map = new Map();
  rows.forEach((row) => {
    map.set(`${row.product_id}-${row.warehouse_id}`, round4(row.demand_qty));
  });

  return map;
};

const getOpenSalesDemandMap = async ({ productIds, warehouseIds }) => {
  if (!productIds.length || !warehouseIds.length) {
    return new Map();
  }

  const placeholdersProducts = productIds.map(() => '?').join(', ');
  const placeholdersWarehouses = warehouseIds.map(() => '?').join(', ');

  const [rows] = await db.query(
    `
    SELECT
      soi.product_id,
      so.warehouse_id,
      COALESCE(SUM(
        GREATEST(
          soi.quantity
          - COALESCE(soi.delivered_quantity, 0),
          0
        )
      ), 0) AS open_so_qty
    FROM sales_order_items soi
    INNER JOIN sales_orders so
      ON so.id = soi.sales_order_id
    WHERE so.status IN ('Approved', 'Partially Invoiced', 'Fully Invoiced')
      AND soi.product_id IN (${placeholdersProducts})
      AND so.warehouse_id IN (${placeholdersWarehouses})
    GROUP BY soi.product_id, so.warehouse_id
    `,
    [...productIds, ...warehouseIds]
  );

  const map = new Map();
  rows.forEach((row) => {
    map.set(`${row.product_id}-${row.warehouse_id}`, round4(row.open_so_qty));
  });

  return map;
};

const getOpenPurchaseSupplyMap = async ({ productIds, supplierIds = [] }) => {
  if (!productIds.length) {
    return {
      byProductSupplier: new Map(),
      byProduct: new Map(),
    };
  }

  const placeholdersProducts = productIds.map(() => '?').join(', ');

  let sql = `
    SELECT
      poi.product_id,
      po.supplier_id,
      COALESCE(SUM(
        GREATEST(
          poi.quantity - COALESCE(poi.received_quantity, 0),
          0
        )
      ), 0) AS open_po_qty
    FROM purchase_order_items poi
    INNER JOIN purchase_orders po
      ON po.id = poi.purchase_order_id
    WHERE po.status IN ('Pending', 'Partial')
      AND poi.product_id IN (${placeholdersProducts})
  `;
  const values = [...productIds];

  if (supplierIds.length) {
    const placeholdersSuppliers = supplierIds.map(() => '?').join(', ');
    sql += ` AND po.supplier_id IN (${placeholdersSuppliers})`;
    values.push(...supplierIds);
  }

  sql += ` GROUP BY poi.product_id, po.supplier_id`;

  const [rows] = await db.query(sql, values);

  const byProductSupplier = new Map();
  const byProduct = new Map();

  rows.forEach((row) => {
    byProductSupplier.set(
      `${row.product_id}-${row.supplier_id}`,
      round4(row.open_po_qty)
    );

    byProduct.set(
      String(row.product_id),
      round4((byProduct.get(String(row.product_id)) || 0) + Number(row.open_po_qty || 0))
    );
  });

  return { byProductSupplier, byProduct };
};

export const getMrpRecommendationsService = async (filters = {}) => {
  const {
    warehouse_id = '',
    product_id = '',
    supplier_id = '',
    coverage_days = 30,
    lookback_days = 30,
    recommended_only = '0',
  } = filters;

  let sql = `
    SELECT
      rp.id AS policy_id,
      rp.product_id,
      rp.warehouse_id,
      rp.supplier_id,
      rp.reorder_point_qty,
      rp.safety_stock_qty,
      rp.min_stock_qty,
      rp.max_stock_qty,
      rp.reorder_qty,
      rp.lead_time_days,
      rp.coverage_days,
      rp.order_multiple_qty,
      rp.min_order_qty,
      rp.is_active,
      rp.notes,
      p.name AS product_name,
      p.sku,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      s.name AS supplier_name,
      COALESCE(stock.quantity, 0) AS on_hand_qty,
      0 AS reserved_qty,
      COALESCE(stock.quantity, 0) AS available_qty,
      COALESCE(stock.unit_cost, 0) AS unit_cost
    FROM replenishment_policies rp
    INNER JOIN products p
      ON p.id = rp.product_id
    INNER JOIN warehouses w
      ON w.id = rp.warehouse_id
    LEFT JOIN suppliers s
      ON s.id = rp.supplier_id
    LEFT JOIN inventory_stocks stock
      ON stock.product_id = rp.product_id
     AND stock.warehouse_id = rp.warehouse_id
    WHERE rp.is_active = 1
  `;
  const values = [];

  if (warehouse_id) {
    sql += ` AND rp.warehouse_id = ?`;
    values.push(Number(warehouse_id));
  }

  if (product_id) {
    sql += ` AND rp.product_id = ?`;
    values.push(Number(product_id));
  }

  if (supplier_id) {
    sql += ` AND rp.supplier_id = ?`;
    values.push(Number(supplier_id));
  }

  sql += ` ORDER BY p.name ASC, w.name ASC`;

  const [policyRows] = await db.query(sql, values);

  if (!policyRows.length) {
    return [];
  }

  const productIds = [...new Set(policyRows.map((row) => Number(row.product_id)))];
  const warehouseIds = [...new Set(policyRows.map((row) => Number(row.warehouse_id)))];
  const supplierIds = [
    ...new Set(
      policyRows
        .map((row) => (row.supplier_id ? Number(row.supplier_id) : null))
        .filter(Boolean)
    ),
  ];

  const demandHistoryMap = await getDemandHistoryMap({
    productIds,
    warehouseIds,
    lookbackDays: Number(lookback_days || 30),
  });

  const openSalesMap = await getOpenSalesDemandMap({
    productIds,
    warehouseIds,
  });

  const openPurchaseMaps = await getOpenPurchaseSupplyMap({
    productIds,
    supplierIds,
  });

  const results = policyRows.map((row) => {
    const key = `${row.product_id}-${row.warehouse_id}`;

    const demandHistoryQty = round4(demandHistoryMap.get(key) || 0);
    const avgDailyDemand = round4(
      demandHistoryQty / Math.max(Number(lookback_days || 30), 1)
    );

    const leadTimeDays = Number(row.lead_time_days || 0);
    const policyCoverageDays = Number(row.coverage_days || coverage_days || 30);

    const openSoQty = round4(openSalesMap.get(key) || 0);

    let openPoQty = 0;
    if (row.supplier_id) {
      openPoQty = round4(
        openPurchaseMaps.byProductSupplier.get(`${row.product_id}-${row.supplier_id}`) || 0
      );
    } else {
      openPoQty = round4(openPurchaseMaps.byProduct.get(String(row.product_id)) || 0);
    }

    const onHandQty = round4(row.on_hand_qty);
    const reservedQty = round4(row.reserved_qty);
    const availableQty = round4(row.available_qty);
    const unitCost = round4(row.unit_cost);

    const leadTimeDemandQty = round4(avgDailyDemand * leadTimeDays);

    const reorderTriggerQty = round4(
      Math.max(
        Number(row.reorder_point_qty || 0),
        Number(row.safety_stock_qty || 0) + leadTimeDemandQty
      )
    );

    const targetStockQty = round4(
      Math.max(
        Number(row.max_stock_qty || 0),
        Number(row.min_stock_qty || 0),
        Number(row.safety_stock_qty || 0) + avgDailyDemand * policyCoverageDays
      )
    );

    const projectedNetQty = round4(availableQty + openPoQty - openSoQty);
    const shortageQty = round4(Math.max(targetStockQty - projectedNetQty, 0));

    let recommendedOrderQty = 0;

    if (projectedNetQty <= reorderTriggerQty || shortageQty > 0) {
      recommendedOrderQty = shortageQty;

      if (Number(row.reorder_qty || 0) > 0 && recommendedOrderQty > 0) {
        recommendedOrderQty = Math.max(recommendedOrderQty, Number(row.reorder_qty || 0));
      }

      if (Number(row.min_order_qty || 0) > 0 && recommendedOrderQty > 0) {
        recommendedOrderQty = Math.max(
          recommendedOrderQty,
          Number(row.min_order_qty || 0)
        );
      }

      recommendedOrderQty = ceilToMultiple(
        recommendedOrderQty,
        Number(row.order_multiple_qty || 0)
      );
    }

    let planningStatus = 'OK';
    if (projectedNetQty <= 0 || availableQty <= 0) {
      planningStatus = 'CRITICAL';
    } else if (recommendedOrderQty > 0) {
      planningStatus = 'REORDER';
    } else if (projectedNetQty <= targetStockQty) {
      planningStatus = 'WATCH';
    }

    return {
      policy_id: row.policy_id,
      product_id: row.product_id,
      product_name: row.product_name,
      sku: row.sku,
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse_name,
      warehouse_code: row.warehouse_code,
      supplier_id: row.supplier_id,
      supplier_name: row.supplier_name,
      on_hand_qty: onHandQty,
      reserved_qty: reservedQty,
      available_qty: availableQty,
      open_po_qty: openPoQty,
      open_so_qty: openSoQty,
      avg_daily_demand: avgDailyDemand,
      lead_time_demand_qty: leadTimeDemandQty,
      reorder_trigger_qty: reorderTriggerQty,
      target_stock_qty: targetStockQty,
      projected_net_qty: projectedNetQty,
      shortage_qty: shortageQty,
      recommended_order_qty: round4(recommendedOrderQty),
      recommended_order_value: round4(recommendedOrderQty * unitCost),
      unit_cost: unitCost,
      lead_time_days: leadTimeDays,
      coverage_days: policyCoverageDays,
      notes: row.notes,
      planning_status: planningStatus,
    };
  });

  if (String(recommended_only) === '1') {
    return results.filter((item) => item.recommended_order_qty > 0);
  }

  return results;
};

export const createMrpRunService = async (connection, payload, userId) => {
  const {
    warehouse_id = null,
    supplier_id = null,
    coverage_days = 30,
    lookback_days = 30,
    run_notes = null,
  } = payload;

  const recommendations = await getMrpRecommendationsService({
    warehouse_id: warehouse_id || '',
    supplier_id: supplier_id || '',
    coverage_days,
    lookback_days,
    recommended_only: '1',
  });

  if (!recommendations.length) {
    throw new Error('No replenishment recommendations found to save');
  }

  const runNumber = await getNextRunNumber(connection);

  const [runResult] = await connection.query(
    `
    INSERT INTO mrp_runs (
      run_number,
      warehouse_id,
      supplier_id,
      coverage_days,
      lookback_days,
      total_items,
      total_recommended_qty,
      total_recommended_value,
      notes,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      runNumber,
      warehouse_id ? Number(warehouse_id) : null,
      supplier_id ? Number(supplier_id) : null,
      Number(coverage_days || 30),
      Number(lookback_days || 30),
      recommendations.length,
      round4(
        recommendations.reduce(
          (sum, item) => sum + Number(item.recommended_order_qty || 0),
          0
        )
      ),
      round4(
        recommendations.reduce(
          (sum, item) => sum + Number(item.recommended_order_value || 0),
          0
        )
      ),
      run_notes,
      userId || null,
    ]
  );

  const runId = runResult.insertId;

  for (const item of recommendations) {
    await connection.query(
      `
      INSERT INTO mrp_run_items (
        mrp_run_id,
        policy_id,
        product_id,
        warehouse_id,
        supplier_id,
        on_hand_qty,
        reserved_qty,
        available_qty,
        open_po_qty,
        open_so_qty,
        avg_daily_demand,
        lead_time_demand_qty,
        reorder_trigger_qty,
        target_stock_qty,
        projected_net_qty,
        shortage_qty,
        recommended_order_qty,
        unit_cost,
        recommended_order_value,
        planning_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        runId,
        item.policy_id,
        item.product_id,
        item.warehouse_id,
        item.supplier_id || null,
        round4(item.on_hand_qty),
        round4(item.reserved_qty),
        round4(item.available_qty),
        round4(item.open_po_qty),
        round4(item.open_so_qty),
        round4(item.avg_daily_demand),
        round4(item.lead_time_demand_qty),
        round4(item.reorder_trigger_qty),
        round4(item.target_stock_qty),
        round4(item.projected_net_qty),
        round4(item.shortage_qty),
        round4(item.recommended_order_qty),
        round4(item.unit_cost),
        round4(item.recommended_order_value),
        item.planning_status,
      ]
    );
  }

  return {
    message: 'MRP run saved successfully',
    run_id: runId,
    run_number: runNumber,
    items: recommendations.length,
  };
};

export const getMrpRunsService = async (filters = {}) => {
  const { warehouse_id = '', supplier_id = '' } = filters;

  let sql = `
    SELECT
      r.*,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      s.name AS supplier_name,
      u.full_name AS created_by_name
    FROM mrp_runs r
    LEFT JOIN warehouses w
      ON w.id = r.warehouse_id
    LEFT JOIN suppliers s
      ON s.id = r.supplier_id
    LEFT JOIN users u
      ON u.id = r.created_by
    WHERE 1 = 1
  `;
  const values = [];

  if (warehouse_id) {
    sql += ` AND r.warehouse_id = ?`;
    values.push(Number(warehouse_id));
  }

  if (supplier_id) {
    sql += ` AND r.supplier_id = ?`;
    values.push(Number(supplier_id));
  }

  sql += ` ORDER BY r.id DESC`;

  const [rows] = await db.query(sql, values);
  return rows;
};

export const getMrpRunByIdService = async (id) => {
  const [[header]] = await db.query(
    `
    SELECT
      r.*,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      s.name AS supplier_name,
      u.full_name AS created_by_name
    FROM mrp_runs r
    LEFT JOIN warehouses w
      ON w.id = r.warehouse_id
    LEFT JOIN suppliers s
      ON s.id = r.supplier_id
    LEFT JOIN users u
      ON u.id = r.created_by
    WHERE r.id = ?
    LIMIT 1
    `,
    [Number(id)]
  );

  if (!header) {
    return null;
  }

  const [items] = await db.query(
    `
    SELECT
      ri.*,
      p.name AS product_name,
      p.sku,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      s.name AS supplier_name
    FROM mrp_run_items ri
    INNER JOIN products p
      ON p.id = ri.product_id
    INNER JOIN warehouses w
      ON w.id = ri.warehouse_id
    LEFT JOIN suppliers s
      ON s.id = ri.supplier_id
    WHERE ri.mrp_run_id = ?
    ORDER BY p.name ASC
    `,
    [Number(id)]
  );

  return {
    ...header,
    items,
  };
};