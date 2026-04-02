import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import PermissionGate from '../components/auth/PermissionGate';
import PurchaseJournalEntriesSection from '../components/purchases/PurchaseJournalEntriesSection';
import {
  createPurchaseOrder,
  getPurchaseMeta,
  getPurchaseOrders,
  getGoodsReceipts,
  getApInvoices,
  getApPayments,
} from '../services/purchaseService';

const initialForm = {
  supplier_id: '',
  warehouse_id: '',
  order_date: new Date().toISOString().slice(0, 10),
  expected_date: '',
  notes: '',
  items: [
    {
      product_id: '',
      quantity: '1',
      unit_cost: '0',
      uom_code: '',
      vendor_sku: '',
    },
  ],
};

export default function PurchasePage() {
  const [meta, setMeta] = useState({ suppliers: [], products: [], warehouses: [] });
  const [orders, setOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPage = async () => {
    try {
      setLoading(true);
      const [metaData, orderData, receiptData, invoiceData, paymentData] = await Promise.all([
        getPurchaseMeta(),
        getPurchaseOrders(),
        getGoodsReceipts(),
        getApInvoices(),
        getApPayments(),
      ]);

      setMeta({
        suppliers: metaData?.suppliers || [],
        products: metaData?.products || [],
        warehouses: metaData?.warehouses || [],
      });
      setOrders(Array.isArray(orderData) ? orderData : []);
      setReceipts(Array.isArray(receiptData) ? receiptData : []);
      setInvoices(Array.isArray(invoiceData) ? invoiceData : []);
      setPayments(Array.isArray(paymentData) ? paymentData : []);
    } catch (error) {
      console.error('Load purchases error:', error);
      alert(error?.response?.data?.message || 'Failed to load purchases page.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, []);

  const stats = useMemo(
    () => [
      { label: 'POs', value: orders.length },
      { label: 'Receipts', value: receipts.length },
      { label: 'AP Invoices', value: invoices.length },
      { label: 'Payments', value: payments.length },
    ],
    [orders, receipts, invoices, payments]
  );

  const updateItem = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      ),
    }));
  };

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { product_id: '', quantity: '1', unit_cost: '0', uom_code: '', vendor_sku: '' },
      ],
    }));
  };

  const removeItem = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const submitPurchaseOrder = async (event) => {
    event.preventDefault();

    if (!form.supplier_id || !form.warehouse_id) {
      alert('Supplier and warehouse are required.');
      return;
    }

    const items = form.items
      .map((item) => ({
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
        unit_cost: Number(item.unit_cost),
        uom_code: item.uom_code || null,
        vendor_sku: item.vendor_sku || null,
      }))
      .filter((item) => item.product_id > 0 && item.quantity > 0);

    if (!items.length) {
      alert('Add at least one valid PO item.');
      return;
    }

    try {
      setSaving(true);
      await createPurchaseOrder({
        supplier_id: Number(form.supplier_id),
        warehouse_id: Number(form.warehouse_id),
        order_date: form.order_date,
        expected_date: form.expected_date || null,
        notes: form.notes || null,
        items,
      });
      setForm(initialForm);
      await loadPage();
      alert('Purchase order created successfully.');
    } catch (error) {
      console.error('Create purchase order error:', error);
      alert(error?.response?.data?.message || 'Failed to create purchase order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Purchasing"
        subtitle="Create purchase orders and monitor goods receipts, AP invoices, payments, and journal postings from one screen."
        stats={stats}
      />

      <SectionCard title="Create Purchase Order" subtitle="Normalized frontend imports and clean service-based screen.">
        <PermissionGate permission="purchases.create">
          <form className="space-y-4" onSubmit={submitPurchaseOrder}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <select
                value={form.supplier_id}
                onChange={(event) => setForm((prev) => ({ ...prev, supplier_id: event.target.value }))}
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none"
              >
                <option value="">Select Supplier</option>
                {meta.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>

              <select
                value={form.warehouse_id}
                onChange={(event) => setForm((prev) => ({ ...prev, warehouse_id: event.target.value }))}
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none"
              >
                <option value="">Select Warehouse</option>
                {meta.warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={form.order_date}
                onChange={(event) => setForm((prev) => ({ ...prev, order_date: event.target.value }))}
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none"
              />
              <input
                type="date"
                value={form.expected_date}
                onChange={(event) => setForm((prev) => ({ ...prev, expected_date: event.target.value }))}
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none"
              />
            </div>

            <textarea
              rows={3}
              placeholder="Notes"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none"
            />

            <div className="space-y-3">
              {form.items.map((item, index) => (
                <div key={`po-item-${index}`} className="grid grid-cols-1 gap-3 rounded-2xl border border-[#ebe4f7] p-4 md:grid-cols-5">
                  <select
                    value={item.product_id}
                    onChange={(event) => updateItem(index, 'product_id', event.target.value)}
                    className="rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none"
                  >
                    <option value="">Select Product</option>
                    {meta.products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="Quantity"
                    value={item.quantity}
                    onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                    className="rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="Unit Cost"
                    value={item.unit_cost}
                    onChange={(event) => updateItem(index, 'unit_cost', event.target.value)}
                    className="rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none"
                  />
                  <input
                    type="text"
                    placeholder="UOM Code"
                    value={item.uom_code}
                    onChange={(event) => updateItem(index, 'uom_code', event.target.value)}
                    className="rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Vendor SKU"
                      value={item.vendor_sku}
                      onChange={(event) => updateItem(index, 'vendor_sku', event.target.value)}
                      className="flex-1 rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none"
                    />
                    <AppButton type="button" variant="ghost" onClick={() => removeItem(index)}>
                      Remove
                    </AppButton>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <AppButton type="button" variant="secondary" onClick={addItem}>
                Add Line
              </AppButton>
              <AppButton type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Create Purchase Order'}
              </AppButton>
            </div>
          </form>
        </PermissionGate>
      </SectionCard>

      <SectionCard title="Purchase Orders">
        {loading ? (
          <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">Loading purchases...</div>
        ) : orders.length === 0 ? (
          <EmptyState message="No purchase orders found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#ebe4f7] text-[#7c7494]">
                  <th className="px-4 py-3">PO #</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-[#f1ebfb]">
                    <td className="px-4 py-3">{order.po_number || `PO-${order.id}`}</td>
                    <td className="px-4 py-3">{order.supplier_name || '-'}</td>
                    <td className="px-4 py-3">{order.warehouse_name || '-'}</td>
                    <td className="px-4 py-3">{String(order.order_date || '').slice(0, 10)}</td>
                    <td className="px-4 py-3">{order.status || '-'}</td>
                    <td className="px-4 py-3">{Number(order.total_amount || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <PurchaseJournalEntriesSection />
    </div>
  );
}