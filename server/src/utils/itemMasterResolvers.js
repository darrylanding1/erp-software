const round4 = (value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? Math.round(num * 10000) / 10000 : 0;
};

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const parseJsonArraySafe = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const parseSerialNumbersInput = (value) => {
  if (!value) return [];

  let parsed = value;

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = value
        .split(/\r?\n|,|;/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error('serial_numbers_json must be a valid JSON array');
  }

  return [...new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean))];
};

const getBaseUomCode = (product) =>
  normalizeCode(product?.uom || product?.base_uom || product?.uom_code || 'EA') || 'EA';

export const getAlternateUoms = (product) => {
  const rows = parseJsonArraySafe(product?.alternate_uoms_json || product?.alternate_uoms);

  return rows
    .map((row) => {
      const code = normalizeCode(row?.code || row?.uom || row?.name || row?.unit || row?.label);
      const factor = Number(
        row?.quantity_in_base ??
          row?.factor ??
          row?.conversion_factor ??
          row?.multiplier ??
          row?.rate ??
          0
      );

      if (!code || !Number.isFinite(factor) || factor <= 0) return null;

      return {
        code,
        factor: round4(factor),
        name: row?.name || row?.label || row?.description || code,
      };
    })
    .filter(Boolean);
};

export const resolveUomConversion = (product, requestedUomCode) => {
  const baseUomCode = getBaseUomCode(product);
  const requestedCode = normalizeCode(requestedUomCode || baseUomCode);

  if (!requestedCode || requestedCode === baseUomCode) {
    return {
      requested_uom_code: baseUomCode,
      base_uom_code: baseUomCode,
      factor_to_base: 1,
    };
  }

  const alt = getAlternateUoms(product).find((row) => row.code === requestedCode);

  if (!alt) {
    throw new Error(
      `${product?.name || 'Product'} does not support alternate UOM "${requestedCode}"`
    );
  }

  return {
    requested_uom_code: requestedCode,
    base_uom_code: baseUomCode,
    factor_to_base: alt.factor,
  };
};

export const getVendorItemMappings = (product) => {
  const rows = parseJsonArraySafe(
    product?.vendor_item_mappings_json || product?.vendor_item_mappings
  );

  return rows.map((row) => ({
    supplier_id: row?.supplier_id != null ? Number(row.supplier_id) : null,
    supplier_code: normalizeCode(row?.supplier_code),
    vendor_sku: String(
      row?.vendor_sku || row?.supplier_sku || row?.item_code || row?.vendor_item_code || ''
    ).trim(),
    vendor_name: String(
      row?.vendor_name || row?.supplier_item_name || row?.description || ''
    ).trim(),
    preferred_uom_code: normalizeCode(
      row?.preferred_uom_code || row?.uom_code || row?.uom || row?.order_uom
    ),
    default_unit_cost: Number(
      row?.default_unit_cost ?? row?.unit_cost ?? row?.last_cost ?? row?.cost ?? NaN
    ),
    is_default: Boolean(row?.is_default),
  }));
};

export const resolveVendorMapping = ({ product, supplierId, vendorSku }) => {
  const mappings = getVendorItemMappings(product);
  if (!mappings.length) {
    return null;
  }

  const normalizedVendorSku = String(vendorSku || '').trim();
  const supplierMatches = mappings.filter(
    (row) => row.supplier_id != null && Number(row.supplier_id) === Number(supplierId)
  );

  if (normalizedVendorSku) {
    const exact = supplierMatches.find(
      (row) => String(row.vendor_sku || '').trim() === normalizedVendorSku
    );

    if (!exact) {
      throw new Error(
        `${product?.name || 'Product'} does not have vendor mapping "${normalizedVendorSku}" for supplier ${supplierId}`
      );
    }

    return exact;
  }

  if (!supplierMatches.length) {
    return null;
  }

  return (
    supplierMatches.find((row) => row.is_default) ||
    supplierMatches.find((row) => row.preferred_uom_code) ||
    supplierMatches[0]
  );
};

export const resolveProductFromVendorSku = ({ products, supplierId, vendorSku }) => {
  const normalizedVendorSku = String(vendorSku || '').trim();
  if (!normalizedVendorSku) return null;

  for (const product of products) {
    const mapping = resolveVendorMapping({
      product,
      supplierId,
      vendorSku: normalizedVendorSku,
    });

    if (mapping) {
      return { product, mapping };
    }
  }

  return null;
};

export const normalizePurchaseLine = ({
  item,
  product,
  supplierId,
}) => {
  const quantity = Number(item?.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(`${product.name} requires a valid quantity`);
  }

  const vendorMapping = resolveVendorMapping({
    product,
    supplierId,
    vendorSku: item?.vendor_sku,
  });

  const conversion = resolveUomConversion(
    product,
    item?.uom_code || vendorMapping?.preferred_uom_code || product?.uom
  );

  const enteredUnitCost =
    item?.unit_cost != null && item?.unit_cost !== ''
      ? Number(item.unit_cost)
      : Number.isFinite(vendorMapping?.default_unit_cost)
      ? Number(vendorMapping.default_unit_cost)
      : Number(product?.standard_cost || product?.base_price || 0);

  if (!Number.isFinite(enteredUnitCost) || enteredUnitCost < 0) {
    throw new Error(`${product.name} requires a valid unit cost`);
  }

  const baseQuantity = round4(quantity * conversion.factor_to_base);
  const baseUnitCost = round4(
    conversion.factor_to_base > 0
      ? enteredUnitCost / conversion.factor_to_base
      : enteredUnitCost
  );

  if (
    (product?.is_serial_tracked || product?.inventory_tracking_type === 'SERIAL') &&
    !Number.isInteger(baseQuantity)
  ) {
    throw new Error(
      `${product.name} must resolve to a whole-number base quantity for serial tracking`
    );
  }

  return {
    product_id: Number(product.id),
    quantity: baseQuantity,
    unit_cost: baseUnitCost,
    line_total: round4(baseQuantity * baseUnitCost),
    entered_quantity: round4(quantity),
    entered_unit_cost: round4(enteredUnitCost),
    requested_uom_code: conversion.requested_uom_code,
    base_uom_code: conversion.base_uom_code,
    vendor_sku: item?.vendor_sku ? String(item.vendor_sku).trim() : null,
    vendor_mapping: vendorMapping,
  };
};

export const normalizeReceiptLine = ({
  item,
  product,
  supplierId,
}) => {
  const enteredQty = Number(item?.received_quantity);
  if (!Number.isFinite(enteredQty) || enteredQty <= 0) {
    throw new Error(`${product.name} requires a valid received quantity`);
  }

  const vendorMapping = resolveVendorMapping({
    product,
    supplierId,
    vendorSku: item?.vendor_sku,
  });

  const conversion = resolveUomConversion(
    product,
    item?.uom_code || vendorMapping?.preferred_uom_code || product?.uom
  );

  const baseQuantity = round4(enteredQty * conversion.factor_to_base);
  const serialNumbers = parseSerialNumbersInput(item?.serial_numbers_json);

  if (
    (product?.is_serial_tracked || product?.inventory_tracking_type === 'SERIAL') &&
    !Number.isInteger(baseQuantity)
  ) {
    throw new Error(
      `${product.name} must resolve to a whole-number base quantity for serial tracking`
    );
  }

  return {
    received_quantity: baseQuantity,
    entered_received_quantity: round4(enteredQty),
    requested_uom_code: conversion.requested_uom_code,
    base_uom_code: conversion.base_uom_code,
    vendor_sku: item?.vendor_sku ? String(item.vendor_sku).trim() : null,
    vendor_mapping: vendorMapping,
    lot_number: item?.lot_number ? String(item.lot_number).trim() : null,
    expiry_date: item?.expiry_date || null,
    serial_numbers_json: serialNumbers,
  };
};