import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import PermissionGate from '../components/auth/PermissionGate';
import {
  getSalesOrderMeta,
  getSalesOrders,
  createSalesOrder,
  approveSalesOrder,
  cancelSalesOrder,
  createInvoiceFromSalesOrder,
} from '../services/salesOrderService';

const today = new Date().toISOString().split('T')[0];

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none transition focus:border-[#9b6bff]';

const money = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const initialItem = {
  product_id: '',
  quantity: 1,
  unit_price: '',
};

const initialForm = {
  customer_id: '',
  warehouse_id: '',
  order_date: today,
  due_date: today,
  remarks: '',
  items: [{ ...initialItem }],
};

const initialFilters = {
  customer_id: '',
  warehouse_id: '',
  status: '',
  date_from: '',
  date_to: '',
  search: '',
};

function StatusPill({ status }) {
  const styles = {
    Draft: 'bg-slate-100 text-slate-700',
    Approved: 'bg-emerald-100 text-emerald-700',
    'Partially Invoiced': 'bg-amber-100 text-amber-700',
    'Fully Invoiced': 'bg-sky-100 text-sky-700',
    Cancelled: 'bg-rose-100 text-rose-700',
  };

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-700'}`}
    >
      {status}
    </span>
  );
}

export default function SalesOrdersPage() {
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);

  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState(initialFilters);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [invoiceDraft, setInvoiceDraft] = useState(null);

  const fetchMeta = async () => {
    try {
      const data = await getSalesOrderMeta();
      setCustomers(data?.customers || []);
      setWarehouses(data?.warehouses || []);
      setProducts(data?.products || []);
    } catch (error) {
      console.error('Fetch sales order meta failed:', error);
    }
  };

  const fetchOrders = async (params = filters) => {
    try {
      const data = await getSalesOrders(params);
      setOrders(data || []);
    } catch (error) {
      console.error('Fetch sales orders failed:', error);
    }
  };

  useEffect(() => {
    fetchMeta();
    fetchOrders();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchOrders(filters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [filters]);

  const headerStats = useMemo(() => {
    const openOrders = orders.filter((row) =>
      ['Draft', 'Approved', 'Partially Invoiced'].includes(row.status)
    ).length;

    const approvedOrders = orders.filter((row) => row.status === 'Approved').length;

    const totalValue = orders.reduce(
      (sum, row) => sum + Number(row.total_amount || 0),
      0
    );

    return [
      { label: 'Sales Orders', value: orders.length },
      { label: 'Open Orders', value: openOrders },
      { label: 'Approved', value: approvedOrders },
      { label: 'Total Value', value: money(totalValue) },
    ];
  }, [orders]);

  const addItemRow = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { ...initialItem }],
    }));
  };

  const removeItemRow = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const updateItem = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const resetForm = () => {
    setForm(initialForm);
  };

  const handleCreateSalesOrder = async (e) => {
    e.preventDefault();

    try {
      await createSalesOrder({
        ...form,
        customer_id: Number(form.customer_id),
        warehouse_id: Number(form.warehouse_id),
        items: form.items.map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
        })),
      });

      resetForm();
      fetchOrders();
      alert('Sales order created successfully');
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to create sales order');
    }
  };

  const handleApprove = async (orderId) => {
    try {
      await approveSalesOrder(orderId);
      fetchOrders();
      alert('Sales order approved successfully');
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to approve sales order');
    }
  };

  const handleCancel = async (orderId) => {
    try {
      await cancelSalesOrder(orderId);
      fetchOrders();
      alert(error?.response?.data?.message || 'Sales order cancelled successfully');
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to cancel sales order');
    }
  };

  const openInvoicePanel = (order) => {
    setSelectedOrder(order);
    setInvoiceDraft({
      invoice_date: today,
      due_date: today,
      remarks: '',
      items: (order.items || []).map((item) => ({
        sales_order_item_id: item.id,
        product_name: item.product_name,
        sku: item.sku,
        ordered_quantity: Number(item.quantity || 0),
        already_invoiced: Number(item.invoiced_quantity || 0),
        remaining_quantity: Number(item.remaining_quantity || 0),
        quantity: Number(item.remaining_quantity || 0),
        unit_price: Number(item.unit_price || 0),
      })),
    });
  };

  const closeInvoicePanel = () => {
    setSelectedOrder(null);
    setInvoiceDraft(null);
  };

  const updateInvoiceQty = (salesOrderItemId, value) => {
    setInvoiceDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.sales_order_item_id === salesOrderItemId
          ? {
              ...item,
              quantity: value === '' ? '' : Number(value),
            }
          : item
      ),
    }));
  };

  const handleCreateInvoice = async () => {
    try {
      const payload = {
        invoice_date: invoiceDraft.invoice_date,
        due_date: invoiceDraft.due_date,
        remarks: invoiceDraft.remarks,
        items: invoiceDraft.items
          .filter((item) => Number(item.quantity || 0) > 0)
          .map((item) => ({
            sales_order_item_id: item.sales_order_item_id,
            quantity: Number(item.quantity || 0),
          })),
      };

      await createInvoiceFromSalesOrder(selectedOrder.id, payload);
      closeInvoicePanel();
      fetchOrders();
      alert('Sales invoice created successfully');
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to create sales invoice');
    }
  };

  const getProductPrice = (productId) => {
    const product = products.find((row) => Number(row.id) === Number(productId));
    return product ? Number(product.market_price || 0) : 0;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Orders"
        subtitle="Create warehouse-based sales orders, approve them, and invoice full or partial quantities."
        stats={headerStats}
      />

      <SectionCard
        title="Create Sales Order"
        subtitle="Select the customer, warehouse, dates, and line items."
      >
        <form className="space-y-4" onSubmit={handleCreateSalesOrder}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#4d3188]">
                Customer
              </label>
              <select
                className={inputClassName}
                value={form.customer_id}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, customer_id: e.target.value }))
                }
                required
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.customer_code} - {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#4d3188]">
                Warehouse
              </label>
              <select
                className={inputClassName}
                value={form.warehouse_id}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, warehouse_id: e.target.value }))
                }
                required
              >
                <option value="">Select warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} - {warehouse.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#4d3188]">
                Order Date
              </label>
              <input
                type="date"
                className={inputClassName}
                value={form.order_date}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, order_date: e.target.value }))
                }
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#4d3188]">
                Due Date
              </label>
              <input
                type="date"
                className={inputClassName}
                value={form.due_date}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, due_date: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#4d3188]">
                Remarks
              </label>
              <input
                type="text"
                className={inputClassName}
                value={form.remarks}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, remarks: e.target.value }))
                }
                placeholder="Optional notes"
              />
            </div>
          </div>

          <div className="space-y-3">
            {form.items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-[#ebe4f7] p-4 lg:grid-cols-12"
              >
                <div className="lg:col-span-6">
                  <label className="mb-2 block text-sm font-medium text-[#4d3188]">
                    Product
                  </label>
                  <select
                    className={inputClassName}
                    value={item.product_id}
                    onChange={(e) => {
                      const nextProductId = e.target.value;
                      updateItem(index, 'product_id', nextProductId);
                      updateItem(index, 'unit_price', getProductPrice(nextProductId));
                    }}
                    required
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-[#4d3188]">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    className={inputClassName}
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                    required
                  />
                </div>

                <div className="lg:col-span-3">
                  <label className="mb-2 block text-sm font-medium text-[#4d3188]">
                    Unit Price
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClassName}
                    value={item.unit_price}
                    onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                    required
                  />
                </div>

                <div className="flex items-end lg:col-span-1">
                  <AppButton
                    type="button"
                    variant="danger"
                    size="sm"
                    className="w-full"
                    onClick={() => removeItemRow(index)}
                    disabled={form.items.length === 1}
                  >
                    Remove
                  </AppButton>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <PermissionGate permission="sales_orders.create">
              <AppButton type="button" variant="secondary" onClick={addItemRow}>
                Add Item
              </AppButton>
            </PermissionGate>
            <PermissionGate permission="sales_orders.create">
              <AppButton type="submit">
                Save Sales Order
              </AppButton>
            </PermissionGate>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Sales Order List"
        subtitle="Filter, approve, cancel, and partially invoice sales orders."
      >
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-6">
          <input
            className={inputClassName}
            placeholder="Search SO number, customer, warehouse"
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
          />

          <select
            className={inputClassName}
            value={filters.customer_id}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, customer_id: e.target.value }))
            }
          >
            <option value="">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>

          <select
            className={inputClassName}
            value={filters.warehouse_id}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, warehouse_id: e.target.value }))
            }
          >
            <option value="">All warehouses</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} - {warehouse.name}
              </option>
            ))}
          </select>

          <select
            className={inputClassName}
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, status: e.target.value }))
            }
          >
            <option value="">All statuses</option>
            <option value="Draft">Draft</option>
            <option value="Approved">Approved</option>
            <option value="Partially Invoiced">Partially Invoiced</option>
            <option value="Fully Invoiced">Fully Invoiced</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <input
            type="date"
            className={inputClassName}
            value={filters.date_from}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, date_from: e.target.value }))
            }
          />

          <input
            type="date"
            className={inputClassName}
            value={filters.date_to}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, date_to: e.target.value }))
            }
          />
        </div>

        {!orders.length ? (
          <EmptyState message="No sales orders found." />
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className="rounded-3xl border border-[#ebe4f7] bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-bold text-[#4d3188]">
                        {order.so_number}
                      </h3>
                      <StatusPill status={order.status} />
                    </div>

                    <p className="text-sm text-[#6e6487]">
                      Customer:{' '}
                      <span className="font-medium text-[#4d3188]">
                        {order.customer_name}
                      </span>
                    </p>

                    <p className="text-sm text-[#6e6487]">
                      Warehouse:{' '}
                      <span className="font-medium text-[#4d3188]">
                        {order.warehouse_code} - {order.warehouse_name}
                      </span>
                    </p>

                    <p className="text-sm text-[#6e6487]">
                      Order Date: {order.order_date} | Due Date: {order.due_date || '—'}
                    </p>

                    <p className="text-sm text-[#6e6487]">
                      Total Quantity: {order.total_quantity} | Invoiced Quantity:{' '}
                      {order.total_invoiced_quantity}
                    </p>

                    <p className="text-sm text-[#6e6487]">
                      Total Amount:{' '}
                      <span className="font-semibold text-[#4d3188]">
                        {money(order.total_amount)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {order.status === 'Draft' && (
                      <PermissionGate permission="sales_orders.update">
                        <AppButton
                          type="button"
                          size="sm"
                          onClick={() => handleApprove(order.id)}
                        >
                          Approve
                        </AppButton>
                      </PermissionGate>
                    )}

                    {['Draft', 'Approved', 'Partially Invoiced'].includes(order.status) && (
                      <PermissionGate permission="sales_orders.update">
                        <AppButton
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => handleCancel(order.id)}
                        >
                          Cancel
                        </AppButton>
                      </PermissionGate>
                    )}

                    {['Approved', 'Partially Invoiced'].includes(order.status) && (
                      <PermissionGate permission="sales_orders.update">
                        <AppButton
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => openInvoicePanel(order)}
                        >
                          Create Invoice
                        </AppButton>
                      </PermissionGate>
                    )}
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-2xl border border-[#ebe4f7]">
                  <table className="min-w-full">
                    <thead className="bg-[#f7f2ff] text-left text-sm text-[#4d3188]">
                      <tr>
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Ordered</th>
                        <th className="px-4 py-3">Invoiced</th>
                        <th className="px-4 py-3">Remaining</th>
                        <th className="px-4 py-3">Unit Price</th>
                        <th className="px-4 py-3">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(order.items || []).map((item) => (
                        <tr
                          key={item.id}
                          className="border-t border-[#f1ebfb] text-sm text-[#5b5371]"
                        >
                          <td className="px-4 py-3">{item.product_name}</td>
                          <td className="px-4 py-3">{item.sku}</td>
                          <td className="px-4 py-3">{item.quantity}</td>
                          <td className="px-4 py-3">{item.invoiced_quantity}</td>
                          <td className="px-4 py-3">{item.remaining_quantity}</td>
                          <td className="px-4 py-3">{money(item.unit_price)}</td>
                          <td className="px-4 py-3">{money(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {order.remarks && (
                  <p className="mt-4 text-sm text-[#6e6487]">
                    Remarks: {order.remarks}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {selectedOrder && invoiceDraft && (
        <SectionCard
          title={`Create Invoice from ${selectedOrder.so_number}`}
          subtitle={`Warehouse: ${selectedOrder.warehouse_code} - ${selectedOrder.warehouse_name}`}
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#4d3188]">
                Invoice Date
              </label>
              <input
                type="date"
                className={inputClassName}
                value={invoiceDraft.invoice_date}
                onChange={(e) =>
                  setInvoiceDraft((prev) => ({
                    ...prev,
                    invoice_date: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#4d3188]">
                Due Date
              </label>
              <input
                type="date"
                className={inputClassName}
                value={invoiceDraft.due_date}
                onChange={(e) =>
                  setInvoiceDraft((prev) => ({
                    ...prev,
                    due_date: e.target.value,
                  }))
                }
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#4d3188]">
                Remarks
              </label>
              <input
                type="text"
                className={inputClassName}
                value={invoiceDraft.remarks}
                onChange={(e) =>
                  setInvoiceDraft((prev) => ({
                    ...prev,
                    remarks: e.target.value,
                  }))
                }
                placeholder="Optional invoice remarks"
              />
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-[#ebe4f7]">
            <table className="min-w-full">
              <thead className="bg-[#f7f2ff] text-left text-sm text-[#4d3188]">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Ordered</th>
                  <th className="px-4 py-3">Already Invoiced</th>
                  <th className="px-4 py-3">Remaining</th>
                  <th className="px-4 py-3">Qty to Invoice</th>
                  <th className="px-4 py-3">Unit Price</th>
                  <th className="px-4 py-3">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {invoiceDraft.items.map((item) => (
                  <tr
                    key={item.sales_order_item_id}
                    className="border-t border-[#f1ebfb] text-sm text-[#5b5371]"
                  >
                    <td className="px-4 py-3">{item.product_name}</td>
                    <td className="px-4 py-3">{item.sku}</td>
                    <td className="px-4 py-3">{item.ordered_quantity}</td>
                    <td className="px-4 py-3">{item.already_invoiced}</td>
                    <td className="px-4 py-3">{item.remaining_quantity}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        max={item.remaining_quantity}
                        className="w-28 rounded-xl border border-[#ebe4f7] px-3 py-2 outline-none focus:border-[#9b6bff]"
                        value={item.quantity}
                        onChange={(e) =>
                          updateInvoiceQty(item.sales_order_item_id, e.target.value)
                        }
                      />
                    </td>
                    <td className="px-4 py-3">{money(item.unit_price)}</td>
                    <td className="px-4 py-3">
                      {money(Number(item.quantity || 0) * Number(item.unit_price || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <PermissionGate permission="sales_orders.update">
              <AppButton type="button" onClick={handleCreateInvoice}>
                Confirm Create Invoice
              </AppButton>
            </PermissionGate>
            <AppButton type="button" variant="secondary" onClick={closeInvoicePanel}>
              Close
            </AppButton>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
