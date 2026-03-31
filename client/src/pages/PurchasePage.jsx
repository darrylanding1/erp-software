import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import PermissionGate from '../components/auth/PermissionGate';
import PurchaseJournalEntriesSection from '../components/purchases/PurchaseJournalEntriesSection';
import {
  getPurchaseMeta,
  getPurchaseOrders,
  createPurchaseOrder,
  receivePurchaseOrder,
  getGoodsReceipts,
  getInvoiceablePurchaseOrders,
  getApInvoices,
  createApInvoice,
  getPayableInvoices,
  getApPayments,
  createApPayment,
} from '../services/purchaseService';

const today = new Date().toISOString().split('T')[0];

const emptyPoItem = {
  product_id: '',
  quantity: '',
  unit_cost: '',
};

export default function PurchasesPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [invoiceablePOs, setInvoiceablePOs] = useState([]);
  const [apInvoices, setApInvoices] = useState([]);
  const [payableInvoices, setPayableInvoices] = useState([]);
  const [apPayments, setApPayments] = useState([]);

  const [loadingPo, setLoadingPo] = useState(true);
  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [loadingInvoiceable, setLoadingInvoiceable] = useState(true);
  const [loadingApInvoices, setLoadingApInvoices] = useState(true);
  const [loadingPayables, setLoadingPayables] = useState(true);
  const [loadingApPayments, setLoadingApPayments] = useState(true);

  const [savingPo, setSavingPo] = useState(false);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [savingApInvoice, setSavingApInvoice] = useState(false);
  const [savingApPayment, setSavingApPayment] = useState(false);

  const [poFilters, setPoFilters] = useState({
    search: '',
    status: '',
    supplier_id: '',
  });

  const [receiptFilters, setReceiptFilters] = useState({
    search: '',
    purchase_order_id: '',
    warehouse_id: '',
  });

  const [apFilters, setApFilters] = useState({
    search: '',
    status: '',
    supplier_id: '',
  });

  const [paymentFilters, setPaymentFilters] = useState({
    search: '',
    supplier_id: '',
    ap_invoice_id: '',
  });

  const [poForm, setPoForm] = useState({
    supplier_id: '',
    order_date: today,
    notes: '',
    items: [{ ...emptyPoItem }],
  });

  const [selectedPo, setSelectedPo] = useState(null);
  const [receiptForm, setReceiptForm] = useState({
    warehouse_id: '',
    receipt_date: today,
    remarks: '',
    items: [],
  });

  const [selectedInvoicePo, setSelectedInvoicePo] = useState(null);
  const [apInvoiceForm, setApInvoiceForm] = useState({
    supplier_invoice_number: '',
    invoice_date: today,
    due_date: '',
    remarks: '',
    items: [],
  });

  const [selectedPayableInvoice, setSelectedPayableInvoice] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    payment_date: today,
    payment_method: 'Bank Transfer',
    reference_number: '',
    amount_paid: '',
    remarks: '',
  });

  const fetchMeta = async () => {
    try {
      const data = await getPurchaseMeta();
      setSuppliers(data.suppliers || []);
      setProducts(data.products || []);
      setWarehouses(data.warehouses || []);
    } catch (error) {
      console.error('Fetch purchase meta failed:', error);
    }
  };

  const fetchPurchaseOrders = async (params = {}) => {
    try {
      setLoadingPo(true);
      const data = await getPurchaseOrders(params);
      setPurchaseOrders(data);
    } catch (error) {
      console.error('Fetch purchase orders failed:', error);
    } finally {
      setLoadingPo(false);
    }
  };

  const fetchGoodsReceipts = async (params = {}) => {
    try {
      setLoadingReceipts(true);
      const data = await getGoodsReceipts(params);
      setGoodsReceipts(data);
    } catch (error) {
      console.error('Fetch goods receipts failed:', error);
    } finally {
      setLoadingReceipts(false);
    }
  };

  const fetchInvoiceablePOs = async () => {
    try {
      setLoadingInvoiceable(true);
      const data = await getInvoiceablePurchaseOrders();
      setInvoiceablePOs(data);
    } catch (error) {
      console.error('Fetch invoiceable POs failed:', error);
    } finally {
      setLoadingInvoiceable(false);
    }
  };

  const fetchApInvoices = async (params = {}) => {
    try {
      setLoadingApInvoices(true);
      const data = await getApInvoices(params);
      setApInvoices(data);
    } catch (error) {
      console.error('Fetch AP invoices failed:', error);
    } finally {
      setLoadingApInvoices(false);
    }
  };

  const fetchPayableInvoices = async () => {
    try {
      setLoadingPayables(true);
      const data = await getPayableInvoices();
      setPayableInvoices(data);
    } catch (error) {
      console.error('Fetch payable invoices failed:', error);
    } finally {
      setLoadingPayables(false);
    }
  };

  const fetchApPayments = async (params = {}) => {
    try {
      setLoadingApPayments(true);
      const data = await getApPayments(params);
      setApPayments(data);
    } catch (error) {
      console.error('Fetch AP payments failed:', error);
    } finally {
      setLoadingApPayments(false);
    }
  };

  useEffect(() => {
    fetchMeta();
    fetchPurchaseOrders();
    fetchGoodsReceipts();
    fetchInvoiceablePOs();
    fetchApInvoices();
    fetchPayableInvoices();
    fetchApPayments();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchPurchaseOrders(poFilters);
    }, 300);
    return () => clearTimeout(timeout);
  }, [poFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchGoodsReceipts(receiptFilters);
    }, 300);
    return () => clearTimeout(timeout);
  }, [receiptFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchApInvoices(apFilters);
    }, 300);
    return () => clearTimeout(timeout);
  }, [apFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchApPayments(paymentFilters);
    }, 300);
    return () => clearTimeout(timeout);
  }, [paymentFilters]);

  const dashboardStats = useMemo(() => {
    return {
      poTotal: purchaseOrders.length,
      poPending: purchaseOrders.filter((po) => po.status === 'Pending').length,
      poPartial: purchaseOrders.filter((po) => po.status === 'Partial').length,
      poReceived: purchaseOrders.filter((po) => po.status === 'Received').length,
      apOpen: apInvoices.filter((inv) => inv.status === 'Open').length,
      apPartial: apInvoices.filter((inv) => inv.status === 'Partially Paid').length,
      apPaid: apInvoices.filter((inv) => inv.status === 'Paid').length,
    };
  }, [purchaseOrders, apInvoices]);

  const handleAddPoLine = () => {
    setPoForm((prev) => ({
      ...prev,
      items: [...prev.items, { ...emptyPoItem }],
    }));
  };

  const handleRemovePoLine = (index) => {
    setPoForm((prev) => ({
      ...prev,
      items:
        prev.items.length === 1
          ? [{ ...emptyPoItem }]
          : prev.items.filter((_, i) => i !== index),
    }));
  };

  const handlePoLineChange = (index, field, value) => {
    setPoForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const poTotal = useMemo(() => {
    return poForm.items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const unitCost = Number(item.unit_cost) || 0;
      return sum + quantity * unitCost;
    }, 0);
  }, [poForm.items]);

  const handleSavePo = async (e) => {
    e.preventDefault();

    try {
      setSavingPo(true);

      await createPurchaseOrder({
        supplier_id: Number(poForm.supplier_id),
        order_date: poForm.order_date,
        notes: poForm.notes,
        items: poForm.items.map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
        })),
      });

      setPoForm({
        supplier_id: '',
        order_date: today,
        notes: '',
        items: [{ ...emptyPoItem }],
      });

      await fetchPurchaseOrders(poFilters);
      alert('Purchase order created successfully.');
    } catch (error) {
      console.error('Create purchase order failed:', error);
      alert(error?.response?.data?.message || 'Failed to create purchase order');
    } finally {
      setSavingPo(false);
    }
  };

  const openReceiptForm = (po) => {
    setSelectedPo(po);
    setReceiptForm({
      warehouse_id: '',
      receipt_date: today,
      remarks: '',
      items: po.items.map((item) => ({
        purchase_order_item_id: item.id,
        product_name: item.product_name,
        sku: item.sku,
        ordered_quantity: Number(item.quantity),
        already_received_quantity: Number(item.received_quantity || 0),
        remaining_quantity:
          Number(item.quantity) - Number(item.received_quantity || 0),
        received_quantity: '',
      })),
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeReceiptForm = () => {
    setSelectedPo(null);
    setReceiptForm({
      warehouse_id: '',
      receipt_date: today,
      remarks: '',
      items: [],
    });
  };

  const handleReceiptQtyChange = (index, value) => {
    setReceiptForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, received_quantity: value } : item
      ),
    }));
  };

  const totalReceiptQty = useMemo(() => {
    return receiptForm.items.reduce(
      (sum, item) => sum + (Number(item.received_quantity) || 0),
      0
    );
  }, [receiptForm.items]);

  const handleSaveReceipt = async (e) => {
    e.preventDefault();

    if (!selectedPo) return;

    try {
      setSavingReceipt(true);

      await receivePurchaseOrder(selectedPo.id, {
        warehouse_id: Number(receiptForm.warehouse_id),
        receipt_date: receiptForm.receipt_date,
        remarks: receiptForm.remarks,
        items: receiptForm.items.map((item) => ({
          purchase_order_item_id: item.purchase_order_item_id,
          received_quantity: Number(item.received_quantity) || 0,
        })),
      });

      closeReceiptForm();

      await Promise.all([
        fetchPurchaseOrders(poFilters),
        fetchGoodsReceipts(receiptFilters),
        fetchInvoiceablePOs(),
        fetchApInvoices(apFilters),
        fetchPayableInvoices(),
        fetchApPayments(paymentFilters),
      ]);

      alert('Goods receipt saved successfully.');
    } catch (error) {
      console.error('Save goods receipt failed:', error);
      alert(error?.response?.data?.message || 'Failed to save goods receipt');
    } finally {
      setSavingReceipt(false);
    }
  };

  const openApInvoiceForm = (po) => {
    setSelectedInvoicePo(po);
    setApInvoiceForm({
      supplier_invoice_number: '',
      invoice_date: today,
      due_date: '',
      remarks: '',
      items: po.items.map((item) => ({
        purchase_order_item_id: item.id,
        product_name: item.product_name,
        sku: item.sku,
        received_quantity: Number(item.received_quantity || 0),
        billed_quantity: Number(item.billed_quantity || 0),
        available_to_bill: Number(item.available_to_bill || 0),
        unit_cost: Number(item.unit_cost || 0),
        invoice_quantity: '',
      })),
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeApInvoiceForm = () => {
    setSelectedInvoicePo(null);
    setApInvoiceForm({
      supplier_invoice_number: '',
      invoice_date: today,
      due_date: '',
      remarks: '',
      items: [],
    });
  };

  const handleApInvoiceQtyChange = (index, value) => {
    setApInvoiceForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, invoice_quantity: value } : item
      ),
    }));
  };

  const apInvoiceTotal = useMemo(() => {
    return apInvoiceForm.items.reduce((sum, item) => {
      return sum + (Number(item.invoice_quantity) || 0) * Number(item.unit_cost || 0);
    }, 0);
  }, [apInvoiceForm.items]);

  const handleSaveApInvoice = async (e) => {
    e.preventDefault();

    if (!selectedInvoicePo) return;

    try {
      setSavingApInvoice(true);

      await createApInvoice({
        purchase_order_id: selectedInvoicePo.id,
        supplier_invoice_number: apInvoiceForm.supplier_invoice_number,
        invoice_date: apInvoiceForm.invoice_date,
        due_date: apInvoiceForm.due_date || null,
        remarks: apInvoiceForm.remarks,
        items: apInvoiceForm.items.map((item) => ({
          purchase_order_item_id: item.purchase_order_item_id,
          billed_quantity: Number(item.invoice_quantity) || 0,
        })),
      });

      closeApInvoiceForm();

      await Promise.all([
        fetchInvoiceablePOs(),
        fetchApInvoices(apFilters),
        fetchPayableInvoices(),
      ]);

      alert('AP invoice created successfully.');
    } catch (error) {
      console.error('Create AP invoice failed:', error);
      alert(error?.response?.data?.message || 'Failed to create AP invoice');
    } finally {
      setSavingApInvoice(false);
    }
  };

  const openPaymentForm = (invoice) => {
    setSelectedPayableInvoice(invoice);
    setPaymentForm({
      payment_date: today,
      payment_method: 'Bank Transfer',
      reference_number: '',
      amount_paid: invoice.balance_amount || '',
      remarks: '',
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closePaymentForm = () => {
    setSelectedPayableInvoice(null);
    setPaymentForm({
      payment_date: today,
      payment_method: 'Bank Transfer',
      reference_number: '',
      amount_paid: '',
      remarks: '',
    });
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();

    if (!selectedPayableInvoice) return;

    try {
      setSavingApPayment(true);

      await createApPayment({
        ap_invoice_id: selectedPayableInvoice.id,
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
        reference_number: paymentForm.reference_number,
        amount_paid: Number(paymentForm.amount_paid),
        remarks: paymentForm.remarks,
      });

      closePaymentForm();

      await Promise.all([
        fetchApInvoices(apFilters),
        fetchPayableInvoices(),
        fetchApPayments(paymentFilters),
      ]);

      alert('AP payment posted successfully.');
    } catch (error) {
      console.error('Create AP payment failed:', error);
      alert(error?.response?.data?.message || 'Failed to post AP payment');
    } finally {
      setSavingApPayment(false);
    }
  };

  const money = (value) =>
    Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const statusBadge = (status) => {
    if (status === 'Received' || status === 'Paid') {
      return 'bg-emerald-100 text-emerald-700';
    }

    if (status === 'Partial' || status === 'Partially Paid') {
      return 'bg-amber-100 text-amber-700';
    }

    if (status === 'Cancelled') {
      return 'bg-rose-100 text-rose-700';
    }

    return 'bg-[#efe4ff] text-[#7344d0]';
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Purchasing"
        subtitle="Manage purchase orders, goods receipts, supplier invoices, and AP payments."
        stats={[
          { label: 'PO Total', value: dashboardStats.poTotal },
          { label: 'PO Pending', value: dashboardStats.poPending },
          { label: 'PO Partial', value: dashboardStats.poPartial, variant: 'warning' },
          { label: 'PO Received', value: dashboardStats.poReceived },
          { label: 'AP Open', value: dashboardStats.apOpen, variant: 'warning' },
          { label: 'AP Paid', value: dashboardStats.apPaid },
        ]}
      />

      <SectionCard
        title="Create Purchase Order"
        subtitle="Create a supplier purchase order with one or more item lines."
      >
        <form onSubmit={handleSavePo} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <select
              value={poForm.supplier_id}
              onChange={(e) => setPoForm((prev) => ({ ...prev, supplier_id: e.target.value }))}
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              required
            >
              <option value="">Select Supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={poForm.order_date}
              onChange={(e) => setPoForm((prev) => ({ ...prev, order_date: e.target.value }))}
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              required
            />

            <input
              type="text"
              placeholder="Notes"
              value={poForm.notes}
              onChange={(e) => setPoForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />
          </div>

          <div className="space-y-3">
            {poForm.items.map((item, index) => (
              <div
                key={`po-line-${index}`}
                className="rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] p-4"
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <select
                    value={item.product_id}
                    onChange={(e) => handlePoLineChange(index, 'product_id', e.target.value)}
                    className="rounded-2xl border border-[#ebe4f7] bg-white px-4 py-3 outline-none focus:border-[#9b6bff]"
                    required
                  >
                    <option value="">Select Product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Quantity"
                    value={item.quantity}
                    onChange={(e) => handlePoLineChange(index, 'quantity', e.target.value)}
                    className="rounded-2xl border border-[#ebe4f7] bg-white px-4 py-3 outline-none focus:border-[#9b6bff]"
                    required
                  />

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Unit Cost"
                    value={item.unit_cost}
                    onChange={(e) => handlePoLineChange(index, 'unit_cost', e.target.value)}
                    className="rounded-2xl border border-[#ebe4f7] bg-white px-4 py-3 outline-none focus:border-[#9b6bff]"
                    required
                  />

                  <div className="flex items-center justify-between rounded-2xl border border-[#ebe4f7] bg-white px-4 py-3">
                    <div className="text-sm text-[#7c7494]">
                      Line Total: ₱
                      {(
                        (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0)
                      ).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>

                    <PermissionGate permission="purchases.create">
                      <AppButton
                        type="button"
                        variant="danger"
                        onClick={() => handleRemovePoLine(index)}
                      >
                        Remove
                      </AppButton>
                    </PermissionGate>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] p-4 sm:flex-row sm:items-center">
            <div className="text-sm font-semibold text-[#4d3188]">
              PO Total: ₱
              {poTotal.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <PermissionGate permission="purchases.create">
                <AppButton type="button" variant="ghost" onClick={handleAddPoLine}>
                  Add Line
                </AppButton>
              </PermissionGate>
              <PermissionGate permission="purchases.create">
                <AppButton type="submit" disabled={savingPo}>
                  {savingPo ? 'Saving PO...' : 'Save Purchase Order'}
                </AppButton>
              </PermissionGate>
            </div>
          </div>
        </form>
      </SectionCard>

      {selectedPo && (
        <SectionCard
          title={`Goods Receipt for ${selectedPo.po_number}`}
          subtitle="Receive ordered stock into a selected warehouse."
          action={
            <PermissionGate permission="goods_receipts.create">
              <AppButton type="button" variant="ghost" size="sm" onClick={closeReceiptForm}>
                Cancel
              </AppButton>
            </PermissionGate>
          }
        >
          <form onSubmit={handleSaveReceipt} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <select
                value={receiptForm.warehouse_id}
                onChange={(e) =>
                  setReceiptForm((prev) => ({ ...prev, warehouse_id: e.target.value }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                required
              >
                <option value="">Select Warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={receiptForm.receipt_date}
                onChange={(e) =>
                  setReceiptForm((prev) => ({ ...prev, receipt_date: e.target.value }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                required
              />

              <input
                type="text"
                placeholder="Remarks"
                value={receiptForm.remarks}
                onChange={(e) =>
                  setReceiptForm((prev) => ({ ...prev, remarks: e.target.value }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#ebe4f7] bg-white">
              <table className="min-w-full">
                <thead className="bg-[#f7f2ff]">
                  <tr className="text-left text-[#4d3188]">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Ordered</th>
                    <th className="px-4 py-3">Already Received</th>
                    <th className="px-4 py-3">Remaining</th>
                    <th className="px-4 py-3">Receive Now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebe4f7]">
                  {receiptForm.items.map((item, index) => (
                    <tr key={`receipt-line-${index}`}>
                      <td className="px-4 py-3">{item.product_name}</td>
                      <td className="px-4 py-3">{item.sku}</td>
                      <td className="px-4 py-3">{item.ordered_quantity}</td>
                      <td className="px-4 py-3">{item.already_received_quantity}</td>
                      <td className="px-4 py-3">{item.remaining_quantity}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          max={item.remaining_quantity}
                          step="0.01"
                          value={item.received_quantity}
                          onChange={(e) => handleReceiptQtyChange(index, e.target.value)}
                          className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] p-4 sm:flex-row sm:items-center">
              <div className="text-sm font-semibold text-[#4d3188]">
                Total receipt quantity: {totalReceiptQty}
              </div>

              <PermissionGate permission="goods_receipts.create">
                <AppButton type="submit" disabled={savingReceipt}>
                  {savingReceipt ? 'Saving Receipt...' : 'Save Goods Receipt'}
                </AppButton>
              </PermissionGate>
            </div>
          </form>
        </SectionCard>
      )}

      <SectionCard
        title="Create Supplier Invoice / AP Invoice"
        subtitle="Generate AP invoices from received purchase orders."
      >
        {selectedInvoicePo ? (
          <form onSubmit={handleSaveApInvoice} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <input
                type="text"
                placeholder="Supplier Invoice Number"
                value={apInvoiceForm.supplier_invoice_number}
                onChange={(e) =>
                  setApInvoiceForm((prev) => ({
                    ...prev,
                    supplier_invoice_number: e.target.value,
                  }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                required
              />

              <input
                type="date"
                value={apInvoiceForm.invoice_date}
                onChange={(e) =>
                  setApInvoiceForm((prev) => ({ ...prev, invoice_date: e.target.value }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                required
              />

              <input
                type="date"
                value={apInvoiceForm.due_date}
                onChange={(e) =>
                  setApInvoiceForm((prev) => ({ ...prev, due_date: e.target.value }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              />

              <input
                type="text"
                placeholder="Remarks"
                value={apInvoiceForm.remarks}
                onChange={(e) =>
                  setApInvoiceForm((prev) => ({ ...prev, remarks: e.target.value }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-[#ebe4f7] bg-white">
              <table className="min-w-full">
                <thead className="bg-[#f7f2ff]">
                  <tr className="text-left text-[#4d3188]">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Received</th>
                    <th className="px-4 py-3">Already Billed</th>
                    <th className="px-4 py-3">Available</th>
                    <th className="px-4 py-3">Unit Cost</th>
                    <th className="px-4 py-3">Bill Now</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ebe4f7]">
                  {apInvoiceForm.items.map((item, index) => (
                    <tr key={`ap-line-${index}`}>
                      <td className="px-4 py-3">{item.product_name}</td>
                      <td className="px-4 py-3">{item.sku}</td>
                      <td className="px-4 py-3">{item.received_quantity}</td>
                      <td className="px-4 py-3">{item.billed_quantity}</td>
                      <td className="px-4 py-3">{item.available_to_bill}</td>
                      <td className="px-4 py-3">₱{money(item.unit_cost)}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          max={item.available_to_bill}
                          step="0.01"
                          value={item.invoice_quantity}
                          onChange={(e) => handleApInvoiceQtyChange(index, e.target.value)}
                          className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] p-4 sm:flex-row sm:items-center">
              <div className="text-sm font-semibold text-[#4d3188]">
                AP Invoice Total: ₱{money(apInvoiceTotal)}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <PermissionGate permission="accounting.post">
                  <AppButton type="button" variant="ghost" onClick={closeApInvoiceForm}>
                    Cancel
                  </AppButton>
                </PermissionGate>
                <PermissionGate permission="accounting.post">
                  <AppButton type="submit" disabled={savingApInvoice}>
                    {savingApInvoice ? 'Saving AP Invoice...' : 'Save AP Invoice'}
                  </AppButton>
                </PermissionGate>
              </div>
            </div>
          </form>
        ) : loadingInvoiceable ? (
          <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
            Loading invoiceable purchase orders...
          </div>
        ) : invoiceablePOs.length === 0 ? (
          <EmptyState message="No invoiceable purchase orders found." />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {invoiceablePOs.map((po) => (
              <div
                key={po.id}
                className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-bold text-[#4d3188]">{po.po_number}</h3>
                    <p className="text-sm text-[#7c7494]">
                      Supplier: {po.supplier_name}
                    </p>
                    <p className="text-sm text-[#7c7494]">Status: {po.status}</p>
                  </div>

                  <PermissionGate permission="accounting.post">
                    <AppButton type="button" onClick={() => openApInvoiceForm(po)}>
                      Create AP Invoice
                    </AppButton>
                  </PermissionGate>
                </div>

                <div className="mt-4 overflow-x-auto rounded-2xl border border-[#f1ebfb]">
                  <table className="min-w-full">
                    <thead className="bg-[#fcfaff]">
                      <tr className="text-left text-[#4d3188]">
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Ordered</th>
                        <th className="px-4 py-3">Received</th>
                        <th className="px-4 py-3">Already Billed</th>
                        <th className="px-4 py-3">Available to Bill</th>
                        <th className="px-4 py-3">Unit Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1ebfb]">
                      {po.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3">{item.product_name}</td>
                          <td className="px-4 py-3">{item.sku}</td>
                          <td className="px-4 py-3">{item.quantity}</td>
                          <td className="px-4 py-3">{item.received_quantity}</td>
                          <td className="px-4 py-3">{item.billed_quantity}</td>
                          <td className="px-4 py-3">{item.available_to_bill}</td>
                          <td className="px-4 py-3">₱{money(item.unit_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {selectedPayableInvoice && (
        <SectionCard
          title={`AP Payment for ${selectedPayableInvoice.invoice_number}`}
          subtitle="Post payment against an AP invoice and update the remaining balance."
          action={
            <PermissionGate permission="accounting.post">
              <AppButton type="button" variant="ghost" size="sm" onClick={closePaymentForm}>
                Cancel
              </AppButton>
            </PermissionGate>
          }
        >
          <form onSubmit={handleSavePayment} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] px-4 py-3">
                <p className="text-xs text-[#7c7494]">Supplier</p>
                <p className="font-semibold text-[#2b2340]">
                  {selectedPayableInvoice.supplier_name}
                </p>
              </div>

              <div className="rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] px-4 py-3">
                <p className="text-xs text-[#7c7494]">Invoice Number</p>
                <p className="font-semibold text-[#2b2340]">
                  {selectedPayableInvoice.invoice_number}
                </p>
              </div>

              <div className="rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] px-4 py-3">
                <p className="text-xs text-[#7c7494]">Outstanding Balance</p>
                <p className="font-semibold text-[#2b2340]">
                  ₱{money(selectedPayableInvoice.balance_amount)}
                </p>
              </div>

              <div className="rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] px-4 py-3">
                <p className="text-xs text-[#7c7494]">Status</p>
                <p className="font-semibold text-[#2b2340]">
                  {selectedPayableInvoice.status}
                </p>
              </div>

              <input
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) =>
                  setPaymentForm((prev) => ({ ...prev, payment_date: e.target.value }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                required
              />

              <select
                value={paymentForm.payment_method}
                onChange={(e) =>
                  setPaymentForm((prev) => ({ ...prev, payment_method: e.target.value }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              >
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cash">Cash</option>
                <option value="Check">Check</option>
              </select>

              <input
                type="text"
                placeholder="Reference Number"
                value={paymentForm.reference_number}
                onChange={(e) =>
                  setPaymentForm((prev) => ({
                    ...prev,
                    reference_number: e.target.value,
                  }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              />

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount Paid"
                value={paymentForm.amount_paid}
                onChange={(e) =>
                  setPaymentForm((prev) => ({ ...prev, amount_paid: e.target.value }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                required
              />

              <textarea
                placeholder="Remarks"
                value={paymentForm.remarks}
                onChange={(e) =>
                  setPaymentForm((prev) => ({ ...prev, remarks: e.target.value }))
                }
                className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff] md:col-span-2 xl:col-span-4"
                rows={3}
              />
            </div>

            <PermissionGate permission="accounting.post">
              <AppButton type="submit" disabled={savingApPayment}>
                {savingApPayment ? 'Saving Payment...' : 'Save AP Payment'}
              </AppButton>
            </PermissionGate>
          </form>
        </SectionCard>
      )}

      <SectionCard
        title="Payable AP Invoices"
        subtitle="Select an open AP invoice and post a supplier payment."
      >
        {loadingPayables ? (
          <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
            Loading payable AP invoices...
          </div>
        ) : payableInvoices.length === 0 ? (
          <EmptyState message="No payable AP invoices found." />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {payableInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-bold text-[#4d3188]">{invoice.invoice_number}</h3>
                    <p className="text-sm text-[#7c7494]">
                      Supplier: {invoice.supplier_name}
                    </p>
                    <p className="text-sm text-[#7c7494]">
                      Balance: ₱{money(invoice.balance_amount)}
                    </p>
                  </div>

                  <PermissionGate permission="accounting.post">
                    <AppButton type="button" onClick={() => openPaymentForm(invoice)}>
                      Post Payment
                    </AppButton>
                  </PermissionGate>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Purchase Orders"
        subtitle="Review PO status and receive stock by warehouse."
        action={
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setPoFilters({
                search: '',
                status: '',
                supplier_id: '',
              })
            }
          >
            Clear Filters
          </AppButton>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="text"
              placeholder="Search PO number or supplier"
              value={poFilters.search}
              onChange={(e) =>
                setPoFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />

            <select
              value={poFilters.status}
              onChange={(e) =>
                setPoFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Partial">Partial</option>
              <option value="Received">Received</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <select
              value={poFilters.supplier_id}
              onChange={(e) =>
                setPoFilters((prev) => ({ ...prev, supplier_id: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          {loadingPo ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading purchase orders...
            </div>
          ) : purchaseOrders.length === 0 ? (
            <EmptyState message="No purchase orders found." />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {purchaseOrders.map((po) => (
                <div
                  key={po.id}
                  className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-[#4d3188]">{po.po_number}</h3>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusBadge(
                            po.status
                          )}`}
                        >
                          {po.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[#7c7494]">
                        Supplier: {po.supplier_name}
                      </p>
                      <p className="text-sm text-[#7c7494]">Order Date: {po.order_date}</p>
                      <p className="text-sm text-[#7c7494]">Notes: {po.notes || '-'}</p>
                    </div>

                    {po.status !== 'Received' && po.status !== 'Cancelled' && (
                      <PermissionGate permission="goods_receipts.create">
                        <AppButton type="button" onClick={() => openReceiptForm(po)}>
                          Receive to Warehouse
                        </AppButton>
                      </PermissionGate>
                    )}
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-2xl border border-[#f1ebfb]">
                    <table className="min-w-full">
                      <thead className="bg-[#fcfaff]">
                        <tr className="text-left text-[#4d3188]">
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3">SKU</th>
                          <th className="px-4 py-3">Quantity</th>
                          <th className="px-4 py-3">Received</th>
                          <th className="px-4 py-3">Unit Cost</th>
                          <th className="px-4 py-3">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f1ebfb]">
                        {po.items?.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3">{item.product_name}</td>
                            <td className="px-4 py-3">{item.sku}</td>
                            <td className="px-4 py-3">{item.quantity}</td>
                            <td className="px-4 py-3">{item.received_quantity}</td>
                            <td className="px-4 py-3">₱{money(item.unit_cost)}</td>
                            <td className="px-4 py-3">
                              ₱{money(Number(item.quantity) * Number(item.unit_cost))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 text-right text-sm font-semibold text-[#4d3188]">
                    Total: ₱{money(po.total_amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Goods Receipt History"
        subtitle="Track warehouse-specific receipts for purchase orders."
        action={
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setReceiptFilters({
                search: '',
                purchase_order_id: '',
                warehouse_id: '',
              })
            }
          >
            Clear Filters
          </AppButton>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="text"
              placeholder="Search receipt number, PO, or supplier"
              value={receiptFilters.search}
              onChange={(e) =>
                setReceiptFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />

            <select
              value={receiptFilters.purchase_order_id}
              onChange={(e) =>
                setReceiptFilters((prev) => ({
                  ...prev,
                  purchase_order_id: e.target.value,
                }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Purchase Orders</option>
              {purchaseOrders.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.po_number}
                </option>
              ))}
            </select>

            <select
              value={receiptFilters.warehouse_id}
              onChange={(e) =>
                setReceiptFilters((prev) => ({ ...prev, warehouse_id: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Warehouses</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>

          {loadingReceipts ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading goods receipts...
            </div>
          ) : goodsReceipts.length === 0 ? (
            <EmptyState message="No goods receipts found." />
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
              <table className="min-w-full">
                <thead className="bg-[#f7f2ff]">
                  <tr className="text-left text-[#4d3188]">
                    <th className="px-6 py-4">Receipt</th>
                    <th className="px-6 py-4">PO Number</th>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Warehouse</th>
                    <th className="px-6 py-4">Receipt Date</th>
                    <th className="px-6 py-4">Total Qty</th>
                    <th className="px-6 py-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1ebfb]">
                  {goodsReceipts.map((receipt) => (
                    <tr key={receipt.id}>
                      <td className="px-6 py-4 font-medium text-[#4d3188]">
                        {receipt.receipt_number}
                      </td>
                      <td className="px-6 py-4">{receipt.po_number}</td>
                      <td className="px-6 py-4">{receipt.supplier_name}</td>
                      <td className="px-6 py-4">{receipt.warehouse_name}</td>
                      <td className="px-6 py-4">{receipt.receipt_date}</td>
                      <td className="px-6 py-4">{receipt.total_quantity}</td>
                      <td className="px-6 py-4">{receipt.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="AP Invoice List"
        subtitle="Review supplier invoices created from received purchase orders."
        action={
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setApFilters({
                search: '',
                status: '',
                supplier_id: '',
              })
            }
          >
            Clear Filters
          </AppButton>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="text"
              placeholder="Search invoice number or supplier"
              value={apFilters.search}
              onChange={(e) =>
                setApFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />

            <select
              value={apFilters.status}
              onChange={(e) =>
                setApFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Status</option>
              <option value="Open">Open</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Paid">Paid</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <select
              value={apFilters.supplier_id}
              onChange={(e) =>
                setApFilters((prev) => ({ ...prev, supplier_id: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          {loadingApInvoices ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading AP invoices...
            </div>
          ) : apInvoices.length === 0 ? (
            <EmptyState message="No AP invoices found." />
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
              <table className="min-w-full">
                <thead className="bg-[#f7f2ff]">
                  <tr className="text-left text-[#4d3188]">
                    <th className="px-6 py-4">Invoice Number</th>
                    <th className="px-6 py-4">PO Number</th>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Invoice Date</th>
                    <th className="px-6 py-4">Due Date</th>
                    <th className="px-6 py-4">Total</th>
                    <th className="px-6 py-4">Paid</th>
                    <th className="px-6 py-4">Balance</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1ebfb]">
                  {apInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="px-6 py-4 font-medium text-[#4d3188]">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-6 py-4">{invoice.po_number}</td>
                      <td className="px-6 py-4">{invoice.supplier_name}</td>
                      <td className="px-6 py-4">{invoice.invoice_date}</td>
                      <td className="px-6 py-4">{invoice.due_date || '-'}</td>
                      <td className="px-6 py-4">₱{money(invoice.total_amount)}</td>
                      <td className="px-6 py-4">₱{money(invoice.paid_amount)}</td>
                      <td className="px-6 py-4">₱{money(invoice.balance_amount)}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${statusBadge(
                            invoice.status
                          )}`}
                        >
                          {invoice.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="AP Payment / Disbursement History"
        subtitle="Track all supplier payments and invoice balance updates."
        action={
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setPaymentFilters({
                search: '',
                supplier_id: '',
                ap_invoice_id: '',
              })
            }
          >
            Clear Filters
          </AppButton>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="text"
              placeholder="Search payment number, supplier, or reference"
              value={paymentFilters.search}
              onChange={(e) =>
                setPaymentFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />

            <select
              value={paymentFilters.supplier_id}
              onChange={(e) =>
                setPaymentFilters((prev) => ({ ...prev, supplier_id: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>

            <select
              value={paymentFilters.ap_invoice_id}
              onChange={(e) =>
                setPaymentFilters((prev) => ({ ...prev, ap_invoice_id: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All AP Invoices</option>
              {apInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoice_number}
                </option>
              ))}
            </select>
          </div>

          {loadingApPayments ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading AP payments...
            </div>
          ) : apPayments.length === 0 ? (
            <EmptyState message="No AP payments found." />
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
              <table className="min-w-full">
                <thead className="bg-[#f7f2ff]">
                  <tr className="text-left text-[#4d3188]">
                    <th className="px-6 py-4">Payment Number</th>
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Invoice Number</th>
                    <th className="px-6 py-4">Payment Date</th>
                    <th className="px-6 py-4">Method</th>
                    <th className="px-6 py-4">Reference</th>
                    <th className="px-6 py-4">Amount Paid</th>
                    <th className="px-6 py-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1ebfb]">
                  {apPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td className="px-6 py-4 font-medium text-[#4d3188]">
                        {payment.payment_number}
                      </td>
                      <td className="px-6 py-4">{payment.supplier_name}</td>
                      <td className="px-6 py-4">{payment.invoice_number}</td>
                      <td className="px-6 py-4">{payment.payment_date}</td>
                      <td className="px-6 py-4">{payment.payment_method}</td>
                      <td className="px-6 py-4">{payment.reference_number || '-'}</td>
                      <td className="px-6 py-4">₱{money(payment.amount_paid)}</td>
                      <td className="px-6 py-4">{payment.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      <PurchaseJournalEntriesSection />
    </div>
  );
}