import {
  getProductBaseUom,
  getProductAlternateUoms,
  getVendorMappingsForProduct,
  normalizeCode,
} from './itemMasterResolvers.js';

export function getConversionFactor(product, requestedUomCode) {
  const baseUom = getProductBaseUom(product);
  const requested = normalizeCode(requestedUomCode || baseUom);

  if (requested === baseUom) {
    return {
      requested_uom_code: requested,
      base_uom_code: baseUom,
      conversion_factor: 1,
    };
  }

  const alt = getProductAlternateUoms(product).find(
    (row) => normalizeCode(row.code) === requested
  );

  if (!alt) {
    throw new Error(`Invalid UOM '${requested}' for product ${product?.name || product?.id}`);
  }

  return {
    requested_uom_code: requested,
    base_uom_code: baseUom,
    conversion_factor: Number(alt.factor),
  };
}

export function resolveVendorPricing(product, supplierId, vendorSku) {
  const mappings = getVendorMappingsForProduct(product, supplierId);
  const chosen =
    mappings.find((row) => row.vendor_sku === vendorSku) ||
    mappings.find((row) => row.is_default) ||
    mappings[0] ||
    null;

  return {
    vendor_sku: chosen?.vendor_sku || vendorSku || null,
    preferred_uom_code: chosen?.preferred_uom_code || null,
    default_unit_cost: Number.isFinite(chosen?.default_unit_cost)
      ? Number(chosen.default_unit_cost)
      : null,
  };
}

export function normalizePurchasingLine({
  product,
  supplierId,
  quantity,
  unitCost,
  vendorSku,
  uomCode,
}) {
  const vendor = resolveVendorPricing(product, supplierId, vendorSku);

  const resolvedUom = normalizeCode(uomCode || vendor.preferred_uom_code || getProductBaseUom(product));
  const conversion = getConversionFactor(product, resolvedUom);

  const requestedQuantity = Number(quantity || 0);
  const requestedUnitCost = Number(unitCost || 0);
  const baseQuantity = requestedQuantity * conversion.conversion_factor;

  if (requestedQuantity <= 0) {
    throw new Error('Quantity must be greater than zero');
  }

  if (requestedUnitCost < 0) {
    throw new Error('Unit cost cannot be negative');
  }

  const baseUnitCost =
    conversion.conversion_factor > 0
      ? requestedUnitCost / conversion.conversion_factor
      : requestedUnitCost;

  return {
    product_id: Number(product.id),
    vendor_sku: vendor.vendor_sku,
    requested_uom_code: conversion.requested_uom_code,
    base_uom_code: conversion.base_uom_code,
    conversion_factor: conversion.conversion_factor,
    requested_quantity: requestedQuantity,
    base_quantity: baseQuantity,
    requested_unit_cost: requestedUnitCost,
    base_unit_cost: baseUnitCost,
    line_total: requestedQuantity * requestedUnitCost,
  };
}