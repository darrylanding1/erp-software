import db from '../config/db.js';
import { createAuditLog } from '../utils/auditTrail.js';

const round4 = (value) => Number(Number(value || 0).toFixed(4));
const round2 = (value) => Number(Number(value || 0).toFixed(2));

const getNextPrNumber = async (connection) => {
  const [rows] = await connection.query(
    `
    SELECT pr_number
    FROM purchase_requisitions
    ORDER BY id DESC
    LIMIT 1
    `
  );

  if (!rows.length || !rows[0].pr_number) {
    return 'PR-00001';
  }

  const current = String(rows[0].pr_number);
  const next = Number(current.split('-').pop() || 0) + 1;
  return `PR-${String(next).padStart(5, '0')}`;
};

const getNextPoNumber = async () => {
  return `PO-${Date.now()}`;
};

const getPurchaseRequisitionHeader = async (connection, requisitionId) => {
  const [[header]] = await connection.query(
    `
    SELECT
      pr.*,
      mr.run_number,
      req_user.full_name AS requested_by_name,
      sub_user.full_name AS submitted_by_name,
      app_user.full_name AS approved_by_name
    FROM purchase_requisitions pr
    LEFT JOIN mrp_runs mr
      ON mr.id = pr.mrp_run_id
    LEFT JOIN users req_user
      ON req_user.id = pr.requested_by
    LEFT JOIN users sub_user
      ON sub_user.id = pr.submitted_by
    LEFT JOIN users app_user
      ON app_user.id = pr.approved_by
    WHERE pr.id = ?
    LIMIT 1
    `,
    [Number(requisitionId)]
  );

  return header || null;
};

const getPurchaseRequisitionItems = async (connection, requisitionId) => {
  const [items] = await connection.query(
    `
    SELECT
      pri.*,
      p.name AS product_name,
      p.sku,
      w.name AS warehouse_name,
      w.code AS warehouse_code,
      s.name AS preferred_supplier_name,
      mri.recommended_order_qty,
      mri.procurement_status AS mrp_procurement_status
    FROM purchase_requisition_items pri
    INNER JOIN products p
      ON p.id = pri.product_id
    INNER JOIN warehouses w
      ON w.id = pri.requested_warehouse_id
    LEFT JOIN suppliers s
      ON s.id = pri.preferred_supplier_id
    LEFT JOIN mrp_run_items mri
      ON mri.id = pri.mrp_run_item_id
    WHERE pri.purchase_requisition_id = ?
    ORDER BY p.name ASC, pri.id ASC
    `,
    [Number(requisitionId)]
  );

  return items;
};

const recalcPurchaseRequisitionTotals = async (connection, requisitionId) => {
  const [[totals]] = await connection.query(
    `
    SELECT COALESCE(SUM(line_total), 0) AS total_amount
    FROM purchase_requisition_items
    WHERE purchase_requisition_id = ?
    `,
    [Number(requisitionId)]
  );

  await connection.query(
    `
    UPDATE purchase_requisitions
    SET total_amount = ?
    WHERE id = ?
    `,
    [round2(totals.total_amount), Number(requisitionId)]
  );
};

const syncMrpRunItemProcurementStatus = async (connection, mrpRunItemId) => {
  const [[row]] = await connection.query(
    `
    SELECT
      id,
      recommended_order_qty,
      requisitioned_qty,
      ordered_qty
    FROM mrp_run_items
    WHERE id = ?
    LIMIT 1
    `,
    [Number(mrpRunItemId)]
  );

  if (!row) return;

  const recommended = round4(row.recommended_order_qty);
  const requisitioned = round4(row.requisitioned_qty);
  const ordered = round4(row.ordered_qty);

  let status = 'Open';
  if (ordered >= recommended && recommended > 0) {
    status = 'Ordered';
  } else if (requisitioned > 0 || ordered > 0) {
    status = 'Requisitioned';
  }

  await connection.query(
    `
    UPDATE mrp_run_items
    SET procurement_status = ?
    WHERE id = ?
    `,
    [status, Number(mrpRunItemId)]
  );
};

const recalcPurchaseRequisitionStatus = async (connection, requisitionId) => {
  const [[header]] = await connection.query(
    `
    SELECT status
    FROM purchase_requisitions
    WHERE id = ?
    LIMIT 1
    `,
    [Number(requisitionId)]
  );

  if (!header) return;

  if (header.status === 'Cancelled') return;

  const [[summary]] = await connection.query(
    `
    SELECT
      COUNT(*) AS line_count,
      COALESCE(SUM(requested_quantity), 0) AS requested_qty,
      COALESCE(SUM(ordered_quantity), 0) AS ordered_qty
    FROM purchase_requisition_items
    WHERE purchase_requisition_id = ?
    `,
    [Number(requisitionId)]
  );

  const requestedQty = round4(summary.requested_qty);
  const orderedQty = round4(summary.ordered_qty);

  let newStatus = header.status;
  if (requestedQty > 0 && orderedQty >= requestedQty) {
    newStatus = 'Converted';
  } else if (orderedQty > 0) {
    newStatus = 'Partially Ordered';
  }

  await connection.query(
    `
    UPDATE purchase_requisitions
    SET status = ?
    WHERE id = ?
    `,
    [newStatus, Number(requisitionId)]
  );
};

export const getPurchaseRequisitionMetaService = async () => {
  const [mrpRuns] = await db.query(
    `
    SELECT
      mr.id,
      mr.run_number,
      mr.created_at,
      mr.total_items,
      mr.total_recommended_qty,
      mr.total_recommended_value
    FROM mrp_runs mr
    ORDER BY mr.id DESC
    `
  );

  const [suppliers] = await db.query(
    `
    SELECT id, name
    FROM suppliers
    WHERE status = 'Active'
    ORDER BY name ASC
    `
  );

  const [warehouses] = await db.query(
    `
    SELECT id, code, name
    FROM warehouses
    WHERE status = 'Active'
    ORDER BY name ASC
    `
  );

  return {
    mrpRuns,
    suppliers,
    warehouses,
  };
};

export const getPurchaseRequisitionsService = async (filters = {}) => {
  const { status = '', mrp_run_id = '' } = filters;

  let sql = `
    SELECT
      pr.*,
      mr.run_number,
      req_user.full_name AS requested_by_name,
      app_user.full_name AS approved_by_name
    FROM purchase_requisitions pr
    LEFT JOIN mrp_runs mr
      ON mr.id = pr.mrp_run_id
    LEFT JOIN users req_user
      ON req_user.id = pr.requested_by
    LEFT JOIN users app_user
      ON app_user.id = pr.approved_by
    WHERE 1 = 1
  `;
  const values = [];

  if (status) {
    sql += ` AND pr.status = ?`;
    values.push(status);
  }

  if (mrp_run_id) {
    sql += ` AND pr.mrp_run_id = ?`;
    values.push(Number(mrp_run_id));
  }

  sql += ` ORDER BY pr.id DESC`;

  const [headers] = await db.query(sql, values);

  if (!headers.length) {
    return [];
  }

  const ids = headers.map((row) => row.id);

  const [items] = await db.query(
    `
    SELECT
      pri.*,
      p.name AS product_name,
      p.sku,
      w.name AS warehouse_name,
      s.name AS preferred_supplier_name
    FROM purchase_requisition_items pri
    INNER JOIN products p
      ON p.id = pri.product_id
    INNER JOIN warehouses w
      ON w.id = pri.requested_warehouse_id
    LEFT JOIN suppliers s
      ON s.id = pri.preferred_supplier_id
    WHERE pri.purchase_requisition_id IN (?)
    ORDER BY pri.purchase_requisition_id DESC, pri.id ASC
    `,
    [ids]
  );

  const itemMap = new Map();

  for (const item of items) {
    if (!itemMap.has(item.purchase_requisition_id)) {
      itemMap.set(item.purchase_requisition_id, []);
    }
    itemMap.get(item.purchase_requisition_id).push(item);
  }

  return headers.map((header) => ({
    ...header,
    items: itemMap.get(header.id) || [],
  }));
};

export const getPurchaseRequisitionByIdService = async (requisitionId) => {
  const connection = await db.getConnection();

  try {
    const header = await getPurchaseRequisitionHeader(connection, requisitionId);
    if (!header) return null;

    const items = await getPurchaseRequisitionItems(connection, requisitionId);

    return {
      ...header,
      items,
    };
  } finally {
    connection.release();
  }
};

export const createPurchaseRequisitionFromMrpRunService = async (
  connection,
  runId,
  payload,
  user,
  ipAddress
) => {
  const {
    requisition_date,
    remarks = null,
    item_ids = [],
  } = payload || {};

  if (!requisition_date) {
    throw new Error('requisition_date is required');
  }

  const [[run]] = await connection.query(
    `
    SELECT id, run_number
    FROM mrp_runs
    WHERE id = ?
    LIMIT 1
    `,
    [Number(runId)]
  );

  if (!run) {
    throw new Error('MRP run not found');
  }

  let sql = `
    SELECT
      mri.*,
      p.name AS product_name,
      p.sku
    FROM mrp_run_items mri
    INNER JOIN products p
      ON p.id = mri.product_id
    WHERE mri.mrp_run_id = ?
      AND mri.recommended_order_qty > 0
      AND (mri.recommended_order_qty - COALESCE(mri.requisitioned_qty, 0)) > 0
  `;
  const values = [Number(runId)];

  if (Array.isArray(item_ids) && item_ids.length > 0) {
    sql += ` AND mri.id IN (?)`;
    values.push(item_ids.map(Number));
  }

  sql += ` ORDER BY mri.id ASC`;

  const [mrpItems] = await connection.query(sql, values);

  if (!mrpItems.length) {
    throw new Error('No open MRP recommendation lines found for requisition');
  }

  const prNumber = await getNextPrNumber(connection);

  const [headerResult] = await connection.query(
    `
    INSERT INTO purchase_requisitions (
      pr_number,
      mrp_run_id,
      requisition_date,
      status,
      remarks,
      total_amount,
      requested_by
    )
    VALUES (?, ?, ?, 'Draft', ?, 0, ?)
    `,
    [
      prNumber,
      Number(runId),
      requisition_date,
      remarks,
      user?.id || null,
    ]
  );

  const requisitionId = headerResult.insertId;
  let totalAmount = 0;

  for (const item of mrpItems) {
    const remainingQty = round4(
      Number(item.recommended_order_qty || 0) - Number(item.requisitioned_qty || 0)
    );

    if (remainingQty <= 0) continue;

    const unitCost = round4(item.unit_cost || 0);
    const lineTotal = round4(remainingQty * unitCost);
    totalAmount += lineTotal;

    const [prItemResult] = await connection.query(
      `
      INSERT INTO purchase_requisition_items (
        purchase_requisition_id,
        mrp_run_item_id,
        product_id,
        requested_warehouse_id,
        preferred_supplier_id,
        requested_quantity,
        ordered_quantity,
        unit_cost,
        line_total,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `,
      [
        requisitionId,
        item.id,
        item.product_id,
        item.warehouse_id,
        item.supplier_id || null,
        remainingQty,
        unitCost,
        lineTotal,
        `Created from ${run.run_number}`,
      ]
    );

    await connection.query(
      `
      UPDATE mrp_run_items
      SET requisitioned_qty = COALESCE(requisitioned_qty, 0) + ?
      WHERE id = ?
      `,
      [remainingQty, Number(item.id)]
    );

    await syncMrpRunItemProcurementStatus(connection, item.id);

    void prItemResult;
  }

  await connection.query(
    `
    UPDATE purchase_requisitions
    SET total_amount = ?
    WHERE id = ?
    `,
    [round2(totalAmount), requisitionId]
  );

  const created = await getPurchaseRequisitionHeader(connection, requisitionId);
  const createdItems = await getPurchaseRequisitionItems(connection, requisitionId);

  await createAuditLog({
    userId: user?.id || null,
    action: 'CREATE',
    moduleName: 'Purchase Requisitions',
    recordId: requisitionId,
    description: `Created purchase requisition ${prNumber} from MRP run ${run.run_number}`,
    newValues: {
      requisition: created,
      items: createdItems,
    },
    ipAddress,
  });

  return {
    message: 'Purchase requisition created successfully',
    item: {
      ...created,
      items: createdItems,
    },
  };
};

export const submitPurchaseRequisitionService = async (
  connection,
  requisitionId,
  user,
  ipAddress
) => {
  const header = await getPurchaseRequisitionHeader(connection, requisitionId);

  if (!header) {
    throw new Error('Purchase requisition not found');
  }

  if (header.status !== 'Draft') {
    throw new Error('Only draft purchase requisitions can be submitted');
  }

  const oldValues = { ...header };

  await connection.query(
    `
    UPDATE purchase_requisitions
    SET status = 'Submitted',
        submitted_by = ?,
        submitted_at = NOW()
    WHERE id = ?
    `,
    [user?.id || null, Number(requisitionId)]
  );

  const updated = await getPurchaseRequisitionHeader(connection, requisitionId);

  await createAuditLog({
    userId: user?.id || null,
    action: 'SUBMIT',
    moduleName: 'Purchase Requisitions',
    recordId: requisitionId,
    description: `Submitted purchase requisition ${header.pr_number}`,
    oldValues,
    newValues: updated,
    ipAddress,
  });

  return {
    message: 'Purchase requisition submitted successfully',
    item: updated,
  };
};

export const approvePurchaseRequisitionService = async (
  connection,
  requisitionId,
  user,
  ipAddress
) => {
  const header = await getPurchaseRequisitionHeader(connection, requisitionId);

  if (!header) {
    throw new Error('Purchase requisition not found');
  }

  if (!['Submitted', 'Partially Ordered'].includes(header.status)) {
    throw new Error('Only submitted or partially ordered requisitions can be approved');
  }

  const oldValues = { ...header };

  await connection.query(
    `
    UPDATE purchase_requisitions
    SET status = 'Approved',
        approved_by = ?,
        approved_at = NOW()
    WHERE id = ?
    `,
    [user?.id || null, Number(requisitionId)]
  );

  const updated = await getPurchaseRequisitionHeader(connection, requisitionId);

  await createAuditLog({
    userId: user?.id || null,
    action: 'APPROVE',
    moduleName: 'Purchase Requisitions',
    recordId: requisitionId,
    description: `Approved purchase requisition ${header.pr_number}`,
    oldValues,
    newValues: updated,
    ipAddress,
  });

  return {
    message: 'Purchase requisition approved successfully',
    item: updated,
  };
};

export const convertPurchaseRequisitionToPoService = async (
  connection,
  requisitionId,
  payload,
  user,
  ipAddress
) => {
  const {
    order_date,
    notes = null,
    item_ids = [],
  } = payload || {};

  if (!order_date) {
    throw new Error('order_date is required');
  }

  const header = await getPurchaseRequisitionHeader(connection, requisitionId);

  if (!header) {
    throw new Error('Purchase requisition not found');
  }

  if (!['Approved', 'Partially Ordered'].includes(header.status)) {
    throw new Error('Only approved or partially ordered requisitions can be converted to purchase orders');
  }

  let sql = `
    SELECT
      pri.*,
      p.name AS product_name,
      p.sku
    FROM purchase_requisition_items pri
    INNER JOIN products p
      ON p.id = pri.product_id
    WHERE pri.purchase_requisition_id = ?
      AND (pri.requested_quantity - COALESCE(pri.ordered_quantity, 0)) > 0
  `;
  const values = [Number(requisitionId)];

  if (Array.isArray(item_ids) && item_ids.length > 0) {
    sql += ` AND pri.id IN (?)`;
    values.push(item_ids.map(Number));
  }

  sql += ` ORDER BY pri.id ASC`;

  const [openItems] = await connection.query(sql, values);

  if (!openItems.length) {
    throw new Error('No open requisition lines found for purchase order conversion');
  }

  const itemsMissingSupplier = openItems.filter((item) => !item.preferred_supplier_id);
  if (itemsMissingSupplier.length > 0) {
    throw new Error(
      `Some requisition lines do not have a preferred supplier: ${itemsMissingSupplier
        .map((item) => item.product_name)
        .join(', ')}`
    );
  }

  const supplierGroups = new Map();

  for (const item of openItems) {
    const key = String(item.preferred_supplier_id);
    if (!supplierGroups.has(key)) {
      supplierGroups.set(key, []);
    }
    supplierGroups.get(key).push(item);
  }

  const createdPurchaseOrders = [];

  for (const [supplierId, groupItems] of supplierGroups.entries()) {
    const poNumber = await getNextPoNumber();

    const totalAmount = round2(
      groupItems.reduce((sum, item) => {
        const remainingQty = round4(item.requested_quantity - item.ordered_quantity);
        return sum + remainingQty * round4(item.unit_cost);
      }, 0)
    );

    const [poResult] = await connection.query(
      `
      INSERT INTO purchase_orders (
        po_number,
        supplier_id,
        order_date,
        status,
        notes,
        total_amount,
        source_type,
        source_reference_id,
        requested_by
      )
      VALUES (?, ?, ?, 'Pending', ?, ?, 'PURCHASE_REQUISITION', ?, ?)
      `,
      [
        poNumber,
        Number(supplierId),
        order_date,
        notes || `Created from ${header.pr_number}`,
        totalAmount,
        Number(requisitionId),
        user?.id || null,
      ]
    );

    const purchaseOrderId = poResult.insertId;
    const createdItems = [];

    for (const item of groupItems) {
      const remainingQty = round4(item.requested_quantity - item.ordered_quantity);
      if (remainingQty <= 0) continue;

      const lineTotal = round2(remainingQty * round4(item.unit_cost));

      const [poItemResult] = await connection.query(
        `
        INSERT INTO purchase_order_items (
          purchase_order_id,
          purchase_requisition_item_id,
          product_id,
          requested_warehouse_id,
          quantity,
          received_quantity,
          unit_cost,
          line_total
        )
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
        `,
        [
          purchaseOrderId,
          item.id,
          item.product_id,
          item.requested_warehouse_id,
          remainingQty,
          round4(item.unit_cost),
          lineTotal,
        ]
      );

      await connection.query(
        `
        UPDATE purchase_requisition_items
        SET ordered_quantity = COALESCE(ordered_quantity, 0) + ?
        WHERE id = ?
        `,
        [remainingQty, item.id]
      );

      if (item.mrp_run_item_id) {
        await connection.query(
          `
          UPDATE mrp_run_items
          SET ordered_qty = COALESCE(ordered_qty, 0) + ?
          WHERE id = ?
          `,
          [remainingQty, Number(item.mrp_run_item_id)]
        );

        await syncMrpRunItemProcurementStatus(connection, item.mrp_run_item_id);
      }

      createdItems.push({
        purchase_order_item_id: poItemResult.insertId,
        purchase_requisition_item_id: item.id,
        product_id: item.product_id,
        requested_warehouse_id: item.requested_warehouse_id,
        quantity: remainingQty,
        unit_cost: round4(item.unit_cost),
        line_total: lineTotal,
      });
    }

    createdPurchaseOrders.push({
      purchase_order_id: purchaseOrderId,
      po_number: poNumber,
      supplier_id: Number(supplierId),
      total_amount: totalAmount,
      items: createdItems,
    });
  }

  await recalcPurchaseRequisitionTotals(connection, requisitionId);
  await recalcPurchaseRequisitionStatus(connection, requisitionId);

  const updated = await getPurchaseRequisitionHeader(connection, requisitionId);
  const updatedItems = await getPurchaseRequisitionItems(connection, requisitionId);

  await createAuditLog({
    userId: user?.id || null,
    action: 'CONVERT',
    moduleName: 'Purchase Requisitions',
    recordId: requisitionId,
    description: `Converted purchase requisition ${header.pr_number} into purchase order(s)`,
    newValues: {
      requisition: updated,
      purchase_orders: createdPurchaseOrders,
    },
    ipAddress,
  });

  return {
    message: 'Purchase order(s) created successfully from purchase requisition',
    requisition: {
      ...updated,
      items: updatedItems,
    },
    purchase_orders: createdPurchaseOrders,
  };
};