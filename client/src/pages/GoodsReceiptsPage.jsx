import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import PermissionGate from '../components/auth/PermissionGate';
import {
  getGoodsReceiptMeta,
  getGoodsReceiptSuggestions,
  getGoodsReceipts,
  getGoodsReceiptById,
  createGoodsReceiptFromPurchaseOrder,
  postGoodsReceipt,
} from '../services/goodsReceiptService';

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] bg-white px-4 py-3 outline-none transition focus:border-[#9b6bff]';

const compactInputClassName =
  'w-full rounded-xl border border-[#ebe4f7] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#9b6bff]';

const today = new Date().toISOString().split('T')[0];

const formatNumber = (value) =>
  new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Number(value || 0));

const parseNumeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeSerialNumbers = (value) => {
  if (!value) return [];

  return [...new Set(
    String(value)
      .split(/\r?\n|,|;/)
      .map((item) => item.trim())
      .filter(Boolean)
  )];
};

const isLotTracked = (line) =>
  Boolean(line?.is_lot_tracked) || String(line?.inventory_tracking_type || '').toUpperCase() === 'LOT';

const isSerialTracked = (line) =>
  Boolean(line?.is_serial_tracked) || String(line?.inventory_tracking_type || '').toUpperCase() === 'SERIAL';

const isExpiryTracked = (line) => Boolean(line?.is_expiry_tracked);

const createLineInput = (line, existing = {}) => ({
  purchase_order_item_id: Number(line.id),
  received_quantity:
    existing.received_quantity !== undefined && existing.received_quantity !== null
      ? String(existing.received_quantity)
      : String(line.suggested_quantity ?? line.remaining_quantity ?? 0),
  lot_number: existing.lot_number ?? '',
  expiry_date: existing.expiry_date ?? '',
  serial_numbers_text: existing.serial_numbers_text ?? '',
});

const getTrackingLabel = (line) => {
  const labels = [];

  if (isLotTracked(line)) labels.push('Lot');
  if (isSerialTracked(line)) labels.push('Serial');
  if (isExpiryTracked(line)) labels.push('Expiry');

  return labels.length ? labels.join(' • ') : 'Standard';
};

export default function GoodsReceiptsPage() {
  const [meta, setMeta] = useState({
    purchaseOrders: [],
    warehouses: [],
  });

  const [form, setForm] = useState({
    purchase_order_id: '',
    warehouse_id: '',
    receipt_date: today,
    remarks: '',
  });

  const [suggestions, setSuggestions] = useState({
    purchase_order: null,
    suggested_warehouse_id: null,
    items: [],
  });

  const [lineInputs, setLineInputs] = useState({});

  const [filters, setFilters] = useState({
    purchase_order_id: '',
    status: '',
  });

  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [selectedGoodsReceipt, setSelectedGoodsReceipt] = useState(null);

  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => {
    const total = goodsReceipts.length;
    const posted = goodsReceipts.filter((item) => item.status === 'Posted').length;
    const draft = goodsReceipts.filter((item) => item.status === 'Draft').length;
    const totalLines = goodsReceipts.reduce(
      (sum, item) => sum + (Array.isArray(item.items) ? item.items.length : 0),
      0
    );

    return {
      total,
      posted,
      draft,
      totalLines,
    };
  }, [goodsReceipts]);

  const loadMeta = async () => {
    try {
      setLoadingMeta(true);
      const data = await getGoodsReceiptMeta();
      setMeta({
        purchaseOrders: Array.isArray(data?.purchaseOrders) ? data.purchaseOrders : [],
        warehouses: Array.isArray(data?.warehouses) ? data.warehouses : [],
      });
    } catch (error) {
      console.error('Load goods receipt meta error:', error);
    } finally {
      setLoadingMeta(false);
    }
  };

  const loadSuggestions = async () => {
    if (!form.purchase_order_id) {
      setSuggestions({
        purchase_order: null,
        suggested_warehouse_id: null,
        items: [],
      });
      setLineInputs({});
      return;
    }

    try {
      setLoadingSuggestions(true);

      const data = await getGoodsReceiptSuggestions({
        purchase_order_id: form.purchase_order_id,
        warehouse_id: form.warehouse_id || undefined,
      });

      const normalizedItems = Array.isArray(data?.items)
        ? data.items.map((item) => ({
            ...item,
            remaining_quantity:
              item.remaining_quantity ??
              Math.max(0, Number(item.quantity || 0) - Number(item.received_quantity || 0)),
            suggested_quantity:
              item.suggested_quantity ??
              Math.max(0, Number(item.quantity || 0) - Number(item.received_quantity || 0)),
          }))
        : [];

      setSuggestions({
        purchase_order: data?.purchase_order || null,
        suggested_warehouse_id: data?.suggested_warehouse_id || null,
        items: normalizedItems,
      });

      setLineInputs((prev) => {
        const next = {};

        normalizedItems.forEach((line) => {
          next[line.id] = createLineInput(line, prev[line.id]);
        });

        return next;
      });

      if (!form.warehouse_id && data?.suggested_warehouse_id) {
        setForm((prev) => ({
          ...prev,
          warehouse_id: String(data.suggested_warehouse_id),
        }));
      }
    } catch (error) {
      console.error('Load goods receipt suggestions error:', error);
      alert(error?.response?.data?.message || 'Failed to load receiving suggestions.');
      setSuggestions({
        purchase_order: null,
        suggested_warehouse_id: null,
        items: [],
      });
      setLineInputs({});
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const loadGoodsReceipts = async () => {
    try {
      setLoadingReceipts(true);
      const data = await getGoodsReceipts(filters);
      setGoodsReceipts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Load goods receipts error:', error);
      setGoodsReceipts([]);
    } finally {
      setLoadingReceipts(false);
    }
  };

  const loadDetails = async (id) => {
    try {
      setLoadingDetails(true);
      const data = await getGoodsReceiptById(id);
      setSelectedGoodsReceipt(data);
    } catch (error) {
      console.error('Load goods receipt details error:', error);
      alert(error?.response?.data?.message || 'Failed to load goods receipt details.');
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    loadMeta();
    loadGoodsReceipts();
  }, []);

  useEffect(() => {
    if (form.purchase_order_id) {
      loadSuggestions();
    } else {
      setSuggestions({
        purchase_order: null,
        suggested_warehouse_id: null,
        items: [],
      });
      setLineInputs({});
    }
  }, [form.purchase_order_id, form.warehouse_id]);

  const handleLineInputChange = (lineId, field, value) => {
    setLineInputs((prev) => ({
      ...prev,
      [lineId]: {
        ...prev[lineId],
        [field]: value,
      },
    }));
  };

  const buildReceiptItemsPayload = () => {
    const payload = [];

    for (const line of suggestions.items) {
      const state = lineInputs[line.id] || createLineInput(line);
      const receivedQty = parseNumeric(state.received_quantity);
      const remainingQty = parseNumeric(line.remaining_quantity);
      const serialNumbers = normalizeSerialNumbers(state.serial_numbers_text);

      if (receivedQty <= 0) {
        continue;
      }

      if (receivedQty > remainingQty) {
        throw new Error(`${line.product_name} receipt quantity cannot exceed open quantity.`);
      }

      if (isLotTracked(line) && !String(state.lot_number || '').trim()) {
        throw new Error(`${line.product_name} requires a lot number.`);
      }

      if (isExpiryTracked(line) && !state.expiry_date) {
        throw new Error(`${line.product_name} requires an expiry date.`);
      }

      if (isSerialTracked(line)) {
        if (!serialNumbers.length) {
          throw new Error(`${line.product_name} requires serial numbers.`);
        }

        if (serialNumbers.length !== receivedQty) {
          throw new Error(
            `${line.product_name} serial count must match the receipt quantity exactly.`
          );
        }
      } else if (serialNumbers.length) {
        throw new Error(`${line.product_name} is not serial-tracked, so remove the serial numbers.`);
      }

      payload.push({
        purchase_order_item_id: Number(line.id),
        received_quantity: receivedQty,
        lot_number: String(state.lot_number || '').trim() || null,
        expiry_date: state.expiry_date || null,
        serial_numbers_json: serialNumbers,
      });
    }

    if (!payload.length) {
      throw new Error('Enter at least one receipt quantity greater than zero.');
    }

    return payload;
  };

  const handleCreateDraft = async (e) => {
    e.preventDefault();

    if (!form.purchase_order_id || !form.warehouse_id || !form.receipt_date) {
      alert('Purchase order, warehouse, and receipt date are required.');
      return;
    }

    try {
      setSaving(true);

      const items = buildReceiptItemsPayload();

      const result = await createGoodsReceiptFromPurchaseOrder(form.purchase_order_id, {
        warehouse_id: Number(form.warehouse_id),
        receipt_date: form.receipt_date,
        remarks: form.remarks,
        items,
        use_suggestions: false,
        auto_post: false,
      });

      alert(result.message || 'Goods receipt draft created.');

      setForm({
        purchase_order_id: '',
        warehouse_id: '',
        receipt_date: today,
        remarks: '',
      });

      setSuggestions({
        purchase_order: null,
        suggested_warehouse_id: null,
        items: [],
      });

      setLineInputs({});

      await loadGoodsReceipts();

      if (result?.item?.id) {
        await loadDetails(result.item.id);
      }
    } catch (error) {
      console.error('Create goods receipt draft error:', error);
      alert(error?.response?.data?.message || error.message || 'Failed to create goods receipt draft.');
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (id) => {
    try {
      setSaving(true);
      const result = await postGoodsReceipt(id);
      alert(result.message || 'Goods receipt posted successfully.');
      await loadGoodsReceipts();
      await loadDetails(id);
      await loadMeta();
    } catch (error) {
      console.error('Post goods receipt error:', error);
      alert(error?.response?.data?.message || 'Failed to post goods receipt.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Goods Receipts"
        subtitle="Receive purchase order lines into the correct warehouse, including lot, expiry, and serial details for tracked items."
        stats={[
          { label: 'Receipts', value: stats.total },
          { label: 'Draft', value: stats.draft },
          { label: 'Posted', value: stats.posted },
          { label: 'Receipt Lines', value: stats.totalLines },
        ]}
      />

      <SectionCard title="Create Goods Receipt from Purchase Order">
        {loadingMeta ? (
          <EmptyState message="Loading purchase orders and warehouses..." />
        ) : (
          <form onSubmit={handleCreateDraft} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Purchase Order
                </label>
                <select
                  className={inputClassName}
                  value={form.purchase_order_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      purchase_order_id: e.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Select purchase order</option>
                  {meta.purchaseOrders.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.po_number} • {po.supplier_name} • Open Qty {formatNumber(po.open_quantity)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Receipt Warehouse
                </label>
                <select
                  className={inputClassName}
                  value={form.warehouse_id}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      warehouse_id: e.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Select warehouse</option>
                  {meta.warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} - {warehouse.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Receipt Date
                </label>
                <input
                  type="date"
                  className={inputClassName}
                  value={form.receipt_date}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      receipt_date: e.target.value,
                    }))
                  }
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Remarks
                </label>
                <input
                  type="text"
                  className={inputClassName}
                  value={form.remarks}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      remarks: e.target.value,
                    }))
                  }
                  placeholder="Optional remarks"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <AppButton type="button" variant="secondary" onClick={loadSuggestions}>
                Refresh Suggestions
              </AppButton>

              <PermissionGate permission="goods_receipts.create">
                <AppButton type="submit" variant="primary" disabled={saving}>
                  {saving ? 'Creating Draft...' : 'Create Goods Receipt Draft'}
                </AppButton>
              </PermissionGate>
            </div>
          </form>
        )}

        <div className="mt-4">
          {loadingSuggestions ? (
            <div className="text-sm text-[#7c7494]">Loading warehouse-aware suggestions...</div>
          ) : !suggestions.purchase_order ? (
            <EmptyState message="Select a purchase order to see receiving suggestions." />
          ) : suggestions.items.length === 0 ? (
            <EmptyState message="No open PO lines found for the selected warehouse." />
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#ebe4f7] bg-[#faf7ff] p-4 text-sm text-[#6e6487]">
                <div className="font-semibold text-[#4d3188]">
                  {suggestions.purchase_order.po_number} • {suggestions.purchase_order.supplier_name}
                </div>
                <div className="mt-1">
                  Fill in lot, expiry, and serial details only for tracked items. Lines with receipt quantity
                  set to 0 will not be included in the draft.
                </div>
              </div>

              <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white">
                <table className="min-w-[1400px] w-full">
                  <thead className="bg-[#f7f2ff] text-left text-[#4d3188]">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Tracking</th>
                      <th className="px-4 py-3">Requested Warehouse</th>
                      <th className="px-4 py-3">PO Qty</th>
                      <th className="px-4 py-3">Received</th>
                      <th className="px-4 py-3">Open Qty</th>
                      <th className="px-4 py-3">Receipt Qty</th>
                      <th className="px-4 py-3">Lot Number</th>
                      <th className="px-4 py-3">Expiry Date</th>
                      <th className="px-4 py-3">Serial Numbers</th>
                      <th className="px-4 py-3">Unit Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.items.map((line) => {
                      const lineState = lineInputs[line.id] || createLineInput(line);
                      const serialCount = normalizeSerialNumbers(lineState.serial_numbers_text).length;

                      return (
                        <tr key={line.id} className="border-t border-[#ebe4f7] align-top">
                          <td className="px-4 py-3">
                            <div className="font-medium text-[#4d3188]">{line.product_name}</div>
                            <div className="text-xs text-[#7c7494]">{line.sku}</div>
                          </td>

                          <td className="px-4 py-3 text-sm text-[#6e6487]">
                            {getTrackingLabel(line)}
                          </td>

                          <td className="px-4 py-3 text-sm text-[#6e6487]">
                            {line.requested_warehouse_name
                              ? `${line.warehouse_code} - ${line.warehouse_name}`
                              : 'No requested warehouse'}
                          </td>

                          <td className="px-4 py-3">{formatNumber(line.quantity)}</td>
                          <td className="px-4 py-3">{formatNumber(line.received_quantity)}</td>
                          <td className="px-4 py-3 font-semibold text-[#4d3188]">
                            {formatNumber(line.remaining_quantity)}
                          </td>

                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              className={compactInputClassName}
                              value={lineState.received_quantity}
                              onChange={(e) =>
                                handleLineInputChange(line.id, 'received_quantity', e.target.value)
                              }
                            />
                          </td>

                          <td className="px-4 py-3">
                            <input
                              type="text"
                              className={compactInputClassName}
                              value={lineState.lot_number}
                              onChange={(e) =>
                                handleLineInputChange(line.id, 'lot_number', e.target.value)
                              }
                              placeholder={isLotTracked(line) ? 'Required' : 'Optional'}
                              disabled={!isLotTracked(line)}
                            />
                          </td>

                          <td className="px-4 py-3">
                            <input
                              type="date"
                              className={compactInputClassName}
                              value={lineState.expiry_date}
                              onChange={(e) =>
                                handleLineInputChange(line.id, 'expiry_date', e.target.value)
                              }
                              disabled={!isExpiryTracked(line)}
                            />
                          </td>

                          <td className="px-4 py-3">
                            <textarea
                              rows={3}
                              className={compactInputClassName}
                              value={lineState.serial_numbers_text}
                              onChange={(e) =>
                                handleLineInputChange(line.id, 'serial_numbers_text', e.target.value)
                              }
                              placeholder={
                                isSerialTracked(line)
                                  ? 'One serial per line, or separate by comma'
                                  : 'Not required'
                              }
                              disabled={!isSerialTracked(line)}
                            />
                            {isSerialTracked(line) ? (
                              <div className="mt-1 text-xs text-[#7c7494]">
                                Current serial count: {serialCount}
                              </div>
                            ) : null}
                          </td>

                          <td className="px-4 py-3">{formatCurrency(line.unit_cost)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Receipt Filters">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <select
            className={inputClassName}
            value={filters.purchase_order_id}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                purchase_order_id: e.target.value,
              }))
            }
          >
            <option value="">All purchase orders</option>
            {meta.purchaseOrders.map((po) => (
              <option key={po.id} value={po.id}>
                {po.po_number}
              </option>
            ))}
          </select>

          <select
            className={inputClassName}
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: e.target.value,
              }))
            }
          >
            <option value="">All statuses</option>
            <option value="Draft">Draft</option>
            <option value="Posted">Posted</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <div className="flex items-end">
            <AppButton type="button" variant="secondary" onClick={loadGoodsReceipts}>
              Apply Filters
            </AppButton>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Goods Receipts">
        {loadingReceipts ? (
          <div className="text-sm text-[#7c7494]">Loading goods receipts...</div>
        ) : goodsReceipts.length === 0 ? (
          <EmptyState message="No goods receipts found." />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1.4fr]">
            <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white">
              <table className="min-w-full">
                <thead className="bg-[#f7f2ff] text-left text-[#4d3188]">
                  <tr>
                    <th className="px-4 py-3">GR</th>
                    <th className="px-4 py-3">Warehouse</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {goodsReceipts.map((receipt) => (
                    <tr key={receipt.id} className="border-t border-[#ebe4f7]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#4d3188]">{receipt.gr_number}</div>
                        <div className="text-xs text-[#7c7494]">
                          {receipt.po_number} • {receipt.supplier_name}
                        </div>
                      </td>
                      <td className="px-4 py-3">{receipt.warehouse_name}</td>
                      <td className="px-4 py-3">{receipt.status}</td>
                      <td className="px-4 py-3">
                        <AppButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => loadDetails(receipt.id)}
                        >
                          View
                        </AppButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-3xl border border-[#ebe4f7] bg-white p-4">
              {loadingDetails ? (
                <div className="text-sm text-[#7c7494]">Loading goods receipt details...</div>
              ) : !selectedGoodsReceipt ? (
                <EmptyState message="Select a goods receipt to view details." />
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-[#4d3188]">
                      {selectedGoodsReceipt.gr_number}
                    </h3>
                    <p className="text-sm text-[#7c7494]">
                      {selectedGoodsReceipt.po_number} • {selectedGoodsReceipt.supplier_name}
                    </p>
                    <p className="text-sm text-[#7c7494]">
                      Warehouse: {selectedGoodsReceipt.warehouse_code} - {selectedGoodsReceipt.warehouse_name}
                    </p>
                    <p className="text-sm text-[#7c7494]">Status: {selectedGoodsReceipt.status}</p>
                  </div>

                  <div>
                    <PermissionGate permission="goods_receipts.post">
                      <AppButton
                        type="button"
                        variant="primary"
                        disabled={saving || selectedGoodsReceipt.status !== 'Draft'}
                        onClick={() => handlePost(selectedGoodsReceipt.id)}
                      >
                        Post Goods Receipt
                      </AppButton>
                    </PermissionGate>
                  </div>

                  <div className="max-h-[420px] overflow-auto rounded-2xl border border-[#ebe4f7]">
                    <table className="min-w-[980px] w-full">
                      <thead className="bg-[#f7f2ff] text-left text-[#4d3188]">
                        <tr>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2">Requested WH</th>
                          <th className="px-3 py-2">Receipt Qty</th>
                          <th className="px-3 py-2">Lot</th>
                          <th className="px-3 py-2">Expiry</th>
                          <th className="px-3 py-2">Serials</th>
                          <th className="px-3 py-2">Unit Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedGoodsReceipt.items?.map((item) => {
                          const serials = Array.isArray(item.serial_numbers_json)
                            ? item.serial_numbers_json
                            : normalizeSerialNumbers(item.serial_numbers_json);

                          return (
                            <tr key={item.id} className="border-t border-[#ebe4f7] align-top">
                              <td className="px-3 py-2">
                                <div className="font-medium text-[#4d3188]">{item.product_name}</div>
                                <div className="text-xs text-[#7c7494]">{item.sku}</div>
                              </td>

                              <td className="px-3 py-2">
                                {item.requested_warehouse_name
                                  ? `${item.requested_warehouse_code} - ${item.requested_warehouse_name}`
                                  : '—'}
                              </td>

                              <td className="px-3 py-2">{formatNumber(item.received_quantity)}</td>
                              <td className="px-3 py-2">{item.lot_number || '—'}</td>
                              <td className="px-3 py-2">{item.expiry_date || '—'}</td>
                              <td className="px-3 py-2">
                                {serials.length ? serials.join(', ') : '—'}
                              </td>
                              <td className="px-3 py-2">{formatCurrency(item.unit_cost)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}