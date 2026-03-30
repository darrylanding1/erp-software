export const insertInventoryLedger = async (connection, payload) => {
  const [result] = await connection.query(
    `
    INSERT INTO inventory_ledger (
      posting_date,
      reference_type,
      reference_id,
      reference_line_id,
      product_id,
      warehouse_id,
      movement_type,
      quantity_in,
      quantity_out,
      unit_cost,
      line_total,
      qty_before,
      qty_after,
      value_before,
      value_after,
      avg_cost_before,
      avg_cost_after,
      is_reversal,
      reversed_ledger_id,
      remarks,
      created_by,
      bin_id,
      lot_id,
      serial_id,
      source_warehouse_id,
      source_bin_id,
      destination_warehouse_id,
      destination_bin_id,
      reservation_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.posting_date,
      payload.reference_type,
      payload.reference_id,
      payload.reference_line_id ?? null,
      payload.product_id,
      payload.warehouse_id,
      payload.movement_type,
      payload.quantity_in ?? 0,
      payload.quantity_out ?? 0,
      payload.unit_cost ?? 0,
      payload.line_total ?? 0,
      payload.qty_before ?? 0,
      payload.qty_after ?? 0,
      payload.value_before ?? 0,
      payload.value_after ?? 0,
      payload.avg_cost_before ?? 0,
      payload.avg_cost_after ?? 0,
      payload.is_reversal ? 1 : 0,
      payload.reversed_ledger_id ?? null,
      payload.remarks ?? null,
      payload.created_by ?? null,
      payload.bin_id ?? null,
      payload.lot_id ?? null,
      payload.serial_id ?? null,
      payload.source_warehouse_id ?? null,
      payload.source_bin_id ?? null,
      payload.destination_warehouse_id ?? null,
      payload.destination_bin_id ?? null,
      payload.reservation_id ?? null,
    ]
  );

  return result.insertId;
};

export const getLedgerByReference = async (connection, referenceType, referenceId) => {
  const [rows] = await connection.query(
    `
    SELECT *
    FROM inventory_ledger
    WHERE reference_type = ?
      AND reference_id = ?
    ORDER BY id ASC
    `,
    [referenceType, referenceId]
  );

  return rows;
};