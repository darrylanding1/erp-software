export async function recordSupplierPrice(connection, {
  supplier_id,
  product_id,
  vendor_sku,
  uom_code,
  unit_cost,
  effective_date,
}) {
  await connection.query(
    `
    UPDATE supplier_product_prices
    SET is_current = 0
    WHERE supplier_id = ?
      AND product_id = ?
      AND IFNULL(vendor_sku, '') = IFNULL(?, '')
      AND IFNULL(uom_code, '') = IFNULL(?, '')
      AND is_current = 1
    `,
    [supplier_id, product_id, vendor_sku || null, uom_code || null]
  );

  await connection.query(
    `
    INSERT INTO supplier_product_prices (
      supplier_id,
      product_id,
      vendor_sku,
      uom_code,
      unit_cost,
      effective_date,
      is_current
    ) VALUES (?, ?, ?, ?, ?, ?, 1)
    `,
    [
      supplier_id,
      product_id,
      vendor_sku || null,
      uom_code || null,
      Number(unit_cost || 0),
      effective_date,
    ]
  );
}