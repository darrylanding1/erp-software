import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import { getCustomers } from '../services/salesService';
import { getPurchaseMeta } from '../services/purchaseService';
import {
  getDeliveryCandidates,
  getSalesDeliveries,
  createSalesDelivery,
  getDeliveryDashboardSummary,
} from '../services/deliveryService';

const today = new Date().toISOString().split('T')[0];

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none transition focus:border-[#9b6bff]';

const money = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function DeliveryPage() {
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [candidateInvoices, setCandidateInvoices] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [summary, setSummary] = useState({
    billed_quantity: 0,
    delivered_quantity: 0,
    returned_quantity: 0,
    open_delivery_quantity: 0,
    not_delivered_count: 0,
    partial_delivered_count: 0,
    fully_delivered_count: 0,
  });

  const [filters, setFilters] = useState({
    customer_id: '',
    warehouse_id: '',
  });

  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [remarks, setRemarks] = useState('');
  const [deliveryItems, setDeliveryItems] = useState([]);

  const [deliveryListFilters, setDeliveryListFilters] = useState({
    sales_invoice_id: '',
    warehouse_id: '',
    date_from: '',
    date_to: '',
    search: '',
  });

  const fetchMasterData = async () => {
    try {
      const [customerData, metaData] = await Promise.all([
        getCustomers(),
        getPurchaseMeta(),
      ]);

      setCustomers(customerData || []);
      setWarehouses(metaData?.warehouses || []);
    } catch (error) {
      console.error('Failed to fetch delivery master data:', error);
    }
  };

  const fetchSummary = async () => {
    try {
      const data = await getDeliveryDashboardSummary();
      setSummary(data);
    } catch (error) {
      console.error('Failed to fetch delivery summary:', error);
    }
  };

  const fetchCandidates = async (params = filters) => {
    if (!params.warehouse_id) {
      setCandidateInvoices([]);
      return;
    }

    try {
      const data = await getDeliveryCandidates(params);
      setCandidateInvoices(data || []);
    } catch (error) {
      console.error('Failed to fetch delivery candidates:', error);
    }
  };

  const fetchDeliveries = async (params = deliveryListFilters) => {
    try {
      const data = await getSalesDeliveries(params);
      setDeliveries(data || []);
    } catch (error) {
      console.error('Failed to fetch deliveries:', error);
    }
  };

  useEffect(() => {
    fetchMasterData();
    fetchDeliveries();
    fetchSummary();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => fetchCandidates(filters), 250);
    return () => clearTimeout(timeout);
  }, [filters]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchDeliveries(deliveryListFilters), 250);
    return () => clearTimeout(timeout);
  }, [deliveryListFilters]);

  const selectedInvoice = useMemo(
    () => candidateInvoices.find((invoice) => String(invoice.id) === String(selectedInvoiceId)),
    [candidateInvoices, selectedInvoiceId]
  );

  useEffect(() => {
    if (!selectedInvoice) {
      setDeliveryItems([]);
      return;
    }

    setDeliveryItems(
      selectedInvoice.items.map((item) => ({
        sales_invoice_item_id: item.id,
        product_id: item.product_id,
        sku: item.sku,
        product_name: item.product_name,
        invoice_quantity: item.invoice_quantity,
        delivered_quantity: item.delivered_quantity,
        remaining_quantity: item.remaining_quantity,
        available_quantity: item.available_quantity ?? 0,
        unit_cost: item.unit_cost ?? 0,
        deliver_now: item.remaining_quantity > 0 ? item.remaining_quantity : 0,
      }))
    );
  }, [selectedInvoice]);

  const handleItemQtyChange = (index, value) => {
    setDeliveryItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        deliver_now: value,
      };
      return next;
    });
  };

  const deliverySummary = useMemo(() => {
    return deliveryItems.reduce(
      (acc, item) => {
        const qty = Number(item.deliver_now || 0);
        const unitCost = Number(item.unit_cost || 0);

        acc.totalQty += qty;
        acc.totalCost += qty * unitCost;
        return acc;
      },
      { totalQty: 0, totalCost: 0 }
    );
  }, [deliveryItems]);

  const headerStats = useMemo(
    () => [
      { label: 'Billed Qty', value: summary.billed_quantity },
      { label: 'Delivered Qty', value: summary.delivered_quantity },
      { label: 'Open Qty', value: summary.open_delivery_quantity },
    ],
    [summary]
  );

  const resetForm = () => {
    setSelectedInvoiceId('');
    setDeliveryDate(today);
    setRemarks('');
    setDeliveryItems([]);
  };

  const handleCreateDelivery = async (e) => {
    e.preventDefault();

    if (!filters.warehouse_id) {
      alert('Please select a warehouse first.');
      return;
    }

    if (!selectedInvoiceId) {
      alert('Please select a sales invoice.');
      return;
    }

    const itemsToDeliver = deliveryItems
      .map((item) => ({
        sales_invoice_item_id: Number(item.sales_invoice_item_id),
        delivered_quantity: Number(item.deliver_now || 0),
      }))
      .filter((item) => item.delivered_quantity > 0);

    if (!itemsToDeliver.length) {
      alert('Enter at least one delivery quantity.');
      return;
    }

    try {
      await createSalesDelivery({
        sales_invoice_id: Number(selectedInvoiceId),
        warehouse_id: Number(filters.warehouse_id),
        delivery_date: deliveryDate,
        remarks,
        items: itemsToDeliver,
      });

      resetForm();
      fetchCandidates(filters);
      fetchDeliveries(deliveryListFilters);
      fetchSummary();
      alert('Sales delivery posted successfully.');
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to create sales delivery');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Delivery / Goods Issue"
        subtitle="Issue stock from a warehouse and auto-post Cost of Goods Sold."
        stats={headerStats}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm">
          <p className="text-sm text-[#7c7494]">Returned Qty</p>
          <p className="mt-2 text-2xl font-bold text-[#4d3188]">{summary.returned_quantity}</p>
        </div>
        <div className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm">
          <p className="text-sm text-[#7c7494]">Not Delivered Invoices</p>
          <p className="mt-2 text-2xl font-bold text-[#4d3188]">{summary.not_delivered_count}</p>
        </div>
        <div className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm">
          <p className="text-sm text-[#7c7494]">Partial Delivered</p>
          <p className="mt-2 text-2xl font-bold text-[#4d3188]">{summary.partial_delivered_count}</p>
        </div>
        <div className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm">
          <p className="text-sm text-[#7c7494]">Fully Delivered</p>
          <p className="mt-2 text-2xl font-bold text-[#4d3188]">{summary.fully_delivered_count}</p>
        </div>
      </div>

      <SectionCard
        title="Create Sales Delivery"
        subtitle="Pick a warehouse, select an invoice with remaining quantities, then post the goods issue."
      >
        <form onSubmit={handleCreateDelivery} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <select
              className={inputClassName}
              value={filters.customer_id}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, customer_id: e.target.value }));
                setSelectedInvoiceId('');
              }}
            >
              <option value="">All Customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.customer_code} - {customer.name}
                </option>
              ))}
            </select>

            <select
              className={inputClassName}
              value={filters.warehouse_id}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, warehouse_id: e.target.value }));
                setSelectedInvoiceId('');
              }}
              required
            >
              <option value="">Select Warehouse</option>
              {warehouses
                .filter((warehouse) => warehouse.status === 'Active')
                .map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} - {warehouse.name}
                  </option>
                ))}
            </select>

            <input
              type="date"
              className={inputClassName}
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              required
            />

            <select
              className={inputClassName}
              value={selectedInvoiceId}
              onChange={(e) => setSelectedInvoiceId(e.target.value)}
              disabled={!filters.warehouse_id}
              required
            >
              <option value="">Select Sales Invoice</option>
              {candidateInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoice_number} - {invoice.customer_name}
                </option>
              ))}
            </select>
          </div>

          <textarea
            rows={2}
            className={inputClassName}
            placeholder="Remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />

          {!filters.warehouse_id ? (
            <EmptyState message="Select a warehouse to load available invoice items and stock." />
          ) : candidateInvoices.length === 0 ? (
            <EmptyState message="No deliverable sales invoices found for this warehouse filter." />
          ) : !selectedInvoice ? (
            <EmptyState message="Select a sales invoice to prepare the delivery." />
          ) : (
            <>
              <div className="rounded-3xl border border-[#ebe4f7] bg-[#fcfaff] p-4">
                <h3 className="text-lg font-bold text-[#4d3188]">
                  {selectedInvoice.invoice_number}
                </h3>
                <p className="mt-1 text-sm text-[#7c7494]">
                  Customer: {selectedInvoice.customer_name} | Invoice Date:{' '}
                  {selectedInvoice.invoice_date}
                </p>
              </div>

              <div className="space-y-3">
                {deliveryItems.map((item, index) => {
                  const requestedQty = Number(item.deliver_now || 0);
                  const maxQty = Math.min(
                    Number(item.remaining_quantity || 0),
                    Number(item.available_quantity || 0)
                  );

                  return (
                    <div
                      key={item.sales_invoice_item_id}
                      className="grid grid-cols-1 gap-3 rounded-2xl border border-[#ebe4f7] bg-white p-4 md:grid-cols-6"
                    >
                      <div className="md:col-span-2">
                        <p className="font-semibold text-[#4d3188]">
                          {item.sku} - {item.product_name}
                        </p>
                        <p className="mt-1 text-sm text-[#7c7494]">
                          Invoice Qty: {item.invoice_quantity} | Delivered:{' '}
                          {item.delivered_quantity} | Remaining: {item.remaining_quantity}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-sm text-[#4d3188]">
                        Available Stock: <span className="font-semibold">{item.available_quantity}</span>
                      </div>

                      <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-sm text-[#4d3188]">
                        Unit Cost: <span className="font-semibold">{money(item.unit_cost)}</span>
                      </div>

                      <input
                        type="number"
                        min="0"
                        max={maxQty}
                        className={inputClassName}
                        value={item.deliver_now}
                        onChange={(e) => handleItemQtyChange(index, e.target.value)}
                      />

                      <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-sm text-[#4d3188]">
                        Line Cost:{' '}
                        <span className="font-semibold">
                          {money(requestedQty * Number(item.unit_cost || 0))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 font-semibold text-[#4d3188]">
                  Total Qty: {deliverySummary.totalQty}
                </div>
                <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 font-semibold text-[#4d3188]">
                  Total COGS: {money(deliverySummary.totalCost)}
                </div>
              </div>

              <div className="flex gap-3">
                <AppButton type="submit">Post Delivery / Goods Issue</AppButton>
                <AppButton type="button" variant="secondary" onClick={resetForm}>
                  Clear
                </AppButton>
              </div>
            </>
          )}
        </form>
      </SectionCard>

      <SectionCard title="Delivery List" subtitle="Review posted goods issues and their inventory costs.">
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <input
            className={inputClassName}
            placeholder="Search delivery / invoice / customer"
            value={deliveryListFilters.search}
            onChange={(e) =>
              setDeliveryListFilters((prev) => ({
                ...prev,
                search: e.target.value,
              }))
            }
          />

          <select
            className={inputClassName}
            value={deliveryListFilters.warehouse_id}
            onChange={(e) =>
              setDeliveryListFilters((prev) => ({
                ...prev,
                warehouse_id: e.target.value,
              }))
            }
          >
            <option value="">All Warehouses</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} - {warehouse.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            className={inputClassName}
            value={deliveryListFilters.date_from}
            onChange={(e) =>
              setDeliveryListFilters((prev) => ({
                ...prev,
                date_from: e.target.value,
              }))
            }
          />

          <input
            type="date"
            className={inputClassName}
            value={deliveryListFilters.date_to}
            onChange={(e) =>
              setDeliveryListFilters((prev) => ({
                ...prev,
                date_to: e.target.value,
              }))
            }
          />

          <select
            className={inputClassName}
            value={deliveryListFilters.sales_invoice_id}
            onChange={(e) =>
              setDeliveryListFilters((prev) => ({
                ...prev,
                sales_invoice_id: e.target.value,
              }))
            }
          >
            <option value="">All Sales Invoices</option>
            {candidateInvoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.invoice_number}
              </option>
            ))}
          </select>
        </div>

        {deliveries.length === 0 ? (
          <EmptyState message="No sales deliveries found." />
        ) : (
          <div className="space-y-4">
            {deliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="overflow-hidden rounded-3xl border border-[#ebe4f7] bg-white shadow-sm"
              >
                <div className="border-b border-[#ebe4f7] bg-[#faf7ff] px-4 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-[#4d3188]">{delivery.delivery_number}</h3>
                      <p className="mt-1 text-sm text-[#7c7494]">
                        Invoice: {delivery.invoice_number} | Customer: {delivery.customer_name}
                      </p>
                      <p className="mt-1 text-sm text-[#7c7494]">
                        Warehouse: {delivery.warehouse_code} - {delivery.warehouse_name} | Date: {delivery.delivery_date}
                      </p>
                      <p className="mt-1 text-sm text-[#6e6487]">{delivery.remarks || '-'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
                      <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                        <p className="text-xs text-[#7c7494]">Status</p>
                        <p className="text-sm font-bold text-[#4d3188]">{delivery.status}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                        <p className="text-xs text-[#7c7494]">Qty</p>
                        <p className="text-sm font-bold text-[#4d3188]">{delivery.total_quantity}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                        <p className="text-xs text-[#7c7494]">COGS</p>
                        <p className="text-sm font-bold text-[#4d3188]">{money(delivery.total_cost)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-center">
                    <thead className="bg-[#f7f2ff]">
                      <tr className="text-[#4d3188]">
                        <th className="px-6 py-4">SKU</th>
                        <th className="px-6 py-4">Product</th>
                        <th className="px-6 py-4">Delivered Qty</th>
                        <th className="px-6 py-4">Unit Cost</th>
                        <th className="px-6 py-4">Line Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delivery.items.map((item) => (
                        <tr key={item.id} className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]">
                          <td className="px-6 py-4">{item.sku}</td>
                          <td className="px-6 py-4">{item.product_name}</td>
                          <td className="px-6 py-4">{item.delivered_quantity}</td>
                          <td className="px-6 py-4">{money(item.unit_cost)}</td>
                          <td className="px-6 py-4">{money(item.line_cost)}</td>
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
    </div>
  );
}