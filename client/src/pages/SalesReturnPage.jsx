import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import { getPurchaseMeta } from '../services/purchaseService';
import { getSalesInvoices } from '../services/salesService';
import {
  getReturnCandidates,
  getSalesReturns,
  createSalesReturn,
  getCreditMemoCandidates,
  getArCreditMemos,
  createArCreditMemo,
} from '../services/salesReturnService';

const today = new Date().toISOString().split('T')[0];

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none transition focus:border-[#9b6bff]';

const money = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function SalesReturnPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [returnCandidates, setReturnCandidates] = useState([]);
  const [salesReturns, setSalesReturns] = useState([]);
  const [creditMemoCandidates, setCreditMemoCandidates] = useState([]);
  const [creditMemos, setCreditMemos] = useState([]);

  const [filters, setFilters] = useState({
    sales_invoice_id: '',
    warehouse_id: '',
  });

  const [selectedDeliveryId, setSelectedDeliveryId] = useState('');
  const [returnDate, setReturnDate] = useState(today);
  const [remarks, setRemarks] = useState('');
  const [returnItems, setReturnItems] = useState([]);

  const [creditFilters, setCreditFilters] = useState({
    sales_invoice_id: '',
  });

  const [selectedReturnId, setSelectedReturnId] = useState('');
  const [creditDate, setCreditDate] = useState(today);
  const [creditRemarks, setCreditRemarks] = useState('');
  const [creditItems, setCreditItems] = useState([]);

  const [listFilters, setListFilters] = useState({
    sales_invoice_id: '',
    warehouse_id: '',
    date_from: '',
    date_to: '',
    search: '',
  });

  const [creditListFilters, setCreditListFilters] = useState({
    sales_invoice_id: '',
    date_from: '',
    date_to: '',
    search: '',
  });

  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [metaData, invoiceData] = await Promise.all([
          getPurchaseMeta(),
          getSalesInvoices(),
        ]);

        setWarehouses(metaData?.warehouses || []);
        setSalesInvoices(invoiceData || []);
      } catch (error) {
        console.error('Load sales return master data failed:', error);
      }
    };

    loadMasterData();
    fetchReturns();
    fetchCreditMemos();
  }, []);

  const fetchCandidates = async (params = filters) => {
    if (!params.warehouse_id) {
      setReturnCandidates([]);
      return;
    }

    try {
      const data = await getReturnCandidates(params);
      setReturnCandidates(data || []);
    } catch (error) {
      console.error('Fetch return candidates failed:', error);
    }
  };

  const fetchReturns = async (params = listFilters) => {
    try {
      const data = await getSalesReturns(params);
      setSalesReturns(data || []);
    } catch (error) {
      console.error('Fetch sales returns failed:', error);
    }
  };

  const fetchCreditCandidates = async (params = creditFilters) => {
    try {
      const data = await getCreditMemoCandidates(params);
      setCreditMemoCandidates(data || []);
    } catch (error) {
      console.error('Fetch credit memo candidates failed:', error);
    }
  };

  const fetchCreditMemos = async (params = creditListFilters) => {
    try {
      const data = await getArCreditMemos(params);
      setCreditMemos(data || []);
    } catch (error) {
      console.error('Fetch credit memos failed:', error);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => fetchCandidates(filters), 250);
    return () => clearTimeout(timeout);
  }, [filters]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchReturns(listFilters), 250);
    return () => clearTimeout(timeout);
  }, [listFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchCreditCandidates(creditFilters), 250);
    return () => clearTimeout(timeout);
  }, [creditFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchCreditMemos(creditListFilters), 250);
    return () => clearTimeout(timeout);
  }, [creditListFilters]);

  const selectedDelivery = useMemo(
    () => returnCandidates.find((item) => String(item.id) === String(selectedDeliveryId)),
    [returnCandidates, selectedDeliveryId]
  );

  const selectedReturn = useMemo(
    () => creditMemoCandidates.find((item) => String(item.id) === String(selectedReturnId)),
    [creditMemoCandidates, selectedReturnId]
  );

  useEffect(() => {
    if (!selectedDelivery) {
      setReturnItems([]);
      return;
    }

    setReturnItems(
      selectedDelivery.items.map((item) => ({
        sales_delivery_item_id: item.id,
        product_id: item.product_id,
        sku: item.sku,
        product_name: item.product_name,
        delivered_quantity: item.delivered_quantity,
        returned_quantity: item.returned_quantity,
        remaining_returnable: item.remaining_returnable,
        unit_cost: item.unit_cost,
        return_now: 0,
      }))
    );
  }, [selectedDelivery]);

  useEffect(() => {
    if (!selectedReturn) {
      setCreditItems([]);
      return;
    }

    setCreditItems(
      selectedReturn.items.map((item) => ({
        sales_return_item_id: item.id,
        product_id: item.product_id,
        sku: item.sku,
        product_name: item.product_name,
        returned_quantity: item.returned_quantity,
        credited_quantity: item.credited_quantity,
        remaining_creditable: item.remaining_creditable,
        unit_price: item.unit_price,
        credit_now: 0,
      }))
    );
  }, [selectedReturn]);

  const handleQtyChange = (index, value) => {
    setReturnItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        return_now: value,
      };
      return next;
    });
  };

  const handleCreditQtyChange = (index, value) => {
    setCreditItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        credit_now: value,
      };
      return next;
    });
  };

  const summary = useMemo(() => {
    return returnItems.reduce(
      (acc, item) => {
        const qty = Number(item.return_now || 0);
        const cost = Number(item.unit_cost || 0);

        acc.totalQty += qty;
        acc.totalCost += qty * cost;
        return acc;
      },
      { totalQty: 0, totalCost: 0 }
    );
  }, [returnItems]);

  const creditSummary = useMemo(() => {
    return creditItems.reduce(
      (acc, item) => {
        const qty = Number(item.credit_now || 0);
        const unitPrice = Number(item.unit_price || 0);

        acc.totalQty += qty;
        acc.totalAmount += qty * unitPrice;
        return acc;
      },
      { totalQty: 0, totalAmount: 0 }
    );
  }, [creditItems]);

  const handleCreateReturn = async (e) => {
    e.preventDefault();

    if (!selectedDelivery || !filters.warehouse_id) {
      alert('Select warehouse and delivery first.');
      return;
    }

    const items = returnItems
      .map((item) => ({
        sales_delivery_item_id: Number(item.sales_delivery_item_id),
        returned_quantity: Number(item.return_now || 0),
      }))
      .filter((item) => item.returned_quantity > 0);

    if (!items.length) {
      alert('Enter at least one return quantity.');
      return;
    }

    try {
      await createSalesReturn({
        sales_invoice_id: Number(selectedDelivery.sales_invoice_id),
        sales_delivery_id: Number(selectedDelivery.id),
        warehouse_id: Number(filters.warehouse_id),
        return_date: returnDate,
        remarks,
        items,
      });

      setSelectedDeliveryId('');
      setRemarks('');
      setReturnItems([]);
      fetchCandidates(filters);
      fetchReturns(listFilters);
      fetchCreditCandidates(creditFilters);
      alert('Sales return posted successfully.');
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to create sales return');
    }
  };

  const handleCreateCreditMemo = async (e) => {
    e.preventDefault();

    if (!selectedReturn) {
      alert('Select a sales return first.');
      return;
    }

    const items = creditItems
      .map((item) => ({
        sales_return_item_id: Number(item.sales_return_item_id),
        quantity: Number(item.credit_now || 0),
      }))
      .filter((item) => item.quantity > 0);

    if (!items.length) {
      alert('Enter at least one credit memo quantity.');
      return;
    }

    try {
      await createArCreditMemo({
        sales_return_id: Number(selectedReturn.id),
        credit_date: creditDate,
        remarks: creditRemarks,
        items,
      });

      setSelectedReturnId('');
      setCreditRemarks('');
      setCreditItems([]);
      fetchCreditCandidates(creditFilters);
      fetchCreditMemos(creditListFilters);
      alert('AR credit memo posted successfully.');
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to create AR credit memo');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Returns & AR Credit Memos"
        subtitle="Return delivered items back to inventory and reduce customer receivables through AR credit memos."
      />

      <SectionCard title="Create Sales Return" subtitle="Select a delivered sales document and return items back to stock.">
        <form className="space-y-4" onSubmit={handleCreateReturn}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <select
              className={inputClassName}
              value={filters.warehouse_id}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, warehouse_id: e.target.value }));
                setSelectedDeliveryId('');
              }}
            >
              <option value="">Select Warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} - {warehouse.name}
                </option>
              ))}
            </select>

            <select
              className={inputClassName}
              value={filters.sales_invoice_id}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, sales_invoice_id: e.target.value }));
                setSelectedDeliveryId('');
              }}
            >
              <option value="">All Sales Invoices</option>
              {salesInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoice_number}
                </option>
              ))}
            </select>

            <input
              type="date"
              className={inputClassName}
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
            />

            <select
              className={inputClassName}
              value={selectedDeliveryId}
              onChange={(e) => setSelectedDeliveryId(e.target.value)}
            >
              <option value="">Select Delivery</option>
              {returnCandidates.map((delivery) => (
                <option key={delivery.id} value={delivery.id}>
                  {delivery.delivery_number} | {delivery.invoice_number} | {delivery.customer_name}
                </option>
              ))}
            </select>
          </div>

          <textarea
            className={inputClassName}
            rows={3}
            placeholder="Return remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />

          {!selectedDelivery ? (
            <EmptyState message="Select a posted delivery to enter return quantities." />
          ) : (
            <>
              <div className="space-y-3">
                {returnItems.map((item, index) => (
                  <div
                    key={item.sales_delivery_item_id}
                    className="grid grid-cols-1 gap-3 rounded-3xl border border-[#ebe4f7] p-4 lg:grid-cols-6"
                  >
                    <div>
                      <p className="text-xs text-[#7c7494]">SKU</p>
                      <p className="font-semibold text-[#4d3188]">{item.sku}</p>
                    </div>

                    <div>
                      <p className="text-xs text-[#7c7494]">Product</p>
                      <p className="font-semibold text-[#4d3188]">{item.product_name}</p>
                    </div>

                    <div>
                      <p className="text-xs text-[#7c7494]">Delivered</p>
                      <p className="font-semibold text-[#4d3188]">{item.delivered_quantity}</p>
                    </div>

                    <div>
                      <p className="text-xs text-[#7c7494]">Remaining Returnable</p>
                      <p className="font-semibold text-[#4d3188]">{item.remaining_returnable}</p>
                    </div>

                    <div>
                      <p className="text-xs text-[#7c7494]">Unit Cost</p>
                      <p className="font-semibold text-[#4d3188]">{money(item.unit_cost)}</p>
                    </div>

                    <div>
                      <p className="mb-1 text-xs text-[#7c7494]">Return Now</p>
                      <input
                        type="number"
                        min="0"
                        max={item.remaining_returnable}
                        className={inputClassName}
                        value={item.return_now}
                        onChange={(e) => handleQtyChange(index, e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 font-semibold text-[#4d3188]">
                  Return Qty: {summary.totalQty}
                </div>
                <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 font-semibold text-[#4d3188]">
                  Return Cost: {money(summary.totalCost)}
                </div>
              </div>

              <AppButton type="submit">Post Sales Return</AppButton>
            </>
          )}
        </form>
      </SectionCard>

      <SectionCard title="Create AR Credit Memo" subtitle="Turn posted sales returns into AR reductions.">
        <form className="space-y-4" onSubmit={handleCreateCreditMemo}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <select
              className={inputClassName}
              value={creditFilters.sales_invoice_id}
              onChange={(e) => {
                setCreditFilters((prev) => ({ ...prev, sales_invoice_id: e.target.value }));
                setSelectedReturnId('');
              }}
            >
              <option value="">All Sales Invoices</option>
              {salesInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.invoice_number}
                </option>
              ))}
            </select>

            <input
              type="date"
              className={inputClassName}
              value={creditDate}
              onChange={(e) => setCreditDate(e.target.value)}
            />

            <select
              className={inputClassName}
              value={selectedReturnId}
              onChange={(e) => setSelectedReturnId(e.target.value)}
            >
              <option value="">Select Sales Return</option>
              {creditMemoCandidates.map((salesReturn) => (
                <option key={salesReturn.id} value={salesReturn.id}>
                  {salesReturn.return_number} | {salesReturn.invoice_number} | {salesReturn.customer_name}
                </option>
              ))}
            </select>
          </div>

          <textarea
            className={inputClassName}
            rows={3}
            placeholder="Credit memo remarks"
            value={creditRemarks}
            onChange={(e) => setCreditRemarks(e.target.value)}
          />

          {!selectedReturn ? (
            <EmptyState message="Select a posted sales return to enter credit quantities." />
          ) : (
            <>
              <div className="space-y-3">
                {creditItems.map((item, index) => (
                  <div
                    key={item.sales_return_item_id}
                    className="grid grid-cols-1 gap-3 rounded-3xl border border-[#ebe4f7] p-4 lg:grid-cols-6"
                  >
                    <div>
                      <p className="text-xs text-[#7c7494]">SKU</p>
                      <p className="font-semibold text-[#4d3188]">{item.sku}</p>
                    </div>

                    <div>
                      <p className="text-xs text-[#7c7494]">Product</p>
                      <p className="font-semibold text-[#4d3188]">{item.product_name}</p>
                    </div>

                    <div>
                      <p className="text-xs text-[#7c7494]">Returned</p>
                      <p className="font-semibold text-[#4d3188]">{item.returned_quantity}</p>
                    </div>

                    <div>
                      <p className="text-xs text-[#7c7494]">Remaining Creditable</p>
                      <p className="font-semibold text-[#4d3188]">{item.remaining_creditable}</p>
                    </div>

                    <div>
                      <p className="text-xs text-[#7c7494]">Unit Price</p>
                      <p className="font-semibold text-[#4d3188]">{money(item.unit_price)}</p>
                    </div>

                    <div>
                      <p className="mb-1 text-xs text-[#7c7494]">Credit Now</p>
                      <input
                        type="number"
                        min="0"
                        max={item.remaining_creditable}
                        className={inputClassName}
                        value={item.credit_now}
                        onChange={(e) => handleCreditQtyChange(index, e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 font-semibold text-[#4d3188]">
                  Credit Qty: {creditSummary.totalQty}
                </div>
                <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 font-semibold text-[#4d3188]">
                  Credit Amount: {money(creditSummary.totalAmount)}
                </div>
              </div>

              <AppButton type="submit">Post AR Credit Memo</AppButton>
            </>
          )}
        </form>
      </SectionCard>

      <SectionCard title="Sales Return List" subtitle="Review posted customer returns.">
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <input
            className={inputClassName}
            placeholder="Search return / invoice / customer"
            value={listFilters.search}
            onChange={(e) => setListFilters((prev) => ({ ...prev, search: e.target.value }))}
          />

          <select
            className={inputClassName}
            value={listFilters.warehouse_id}
            onChange={(e) => setListFilters((prev) => ({ ...prev, warehouse_id: e.target.value }))}
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
            value={listFilters.date_from}
            onChange={(e) => setListFilters((prev) => ({ ...prev, date_from: e.target.value }))}
          />

          <input
            type="date"
            className={inputClassName}
            value={listFilters.date_to}
            onChange={(e) => setListFilters((prev) => ({ ...prev, date_to: e.target.value }))}
          />

          <select
            className={inputClassName}
            value={listFilters.sales_invoice_id}
            onChange={(e) => setListFilters((prev) => ({ ...prev, sales_invoice_id: e.target.value }))}
          >
            <option value="">All Sales Invoices</option>
            {salesInvoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.invoice_number}
              </option>
            ))}
          </select>
        </div>

        {salesReturns.length === 0 ? (
          <EmptyState message="No sales returns found." />
        ) : (
          <div className="space-y-4">
            {salesReturns.map((salesReturn) => (
              <div
                key={salesReturn.id}
                className="overflow-hidden rounded-3xl border border-[#ebe4f7] bg-white shadow-sm"
              >
                <div className="border-b border-[#ebe4f7] bg-[#faf7ff] px-4 py-4 sm:px-6">
                  <h3 className="text-lg font-bold text-[#4d3188]">{salesReturn.return_number}</h3>
                  <p className="mt-1 text-sm text-[#7c7494]">
                    Invoice: {salesReturn.invoice_number} | Customer: {salesReturn.customer_name}
                  </p>
                  <p className="mt-1 text-sm text-[#7c7494]">
                    Warehouse: {salesReturn.warehouse_code} - {salesReturn.warehouse_name} | Date: {salesReturn.return_date}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-center">
                    <thead className="bg-[#f7f2ff]">
                      <tr className="text-[#4d3188]">
                        <th className="px-6 py-4">SKU</th>
                        <th className="px-6 py-4">Product</th>
                        <th className="px-6 py-4">Returned Qty</th>
                        <th className="px-6 py-4">Unit Cost</th>
                        <th className="px-6 py-4">Line Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesReturn.items.map((item) => (
                        <tr key={item.id} className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]">
                          <td className="px-6 py-4">{item.sku}</td>
                          <td className="px-6 py-4">{item.product_name}</td>
                          <td className="px-6 py-4">{item.returned_quantity}</td>
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

      <SectionCard title="AR Credit Memo List" subtitle="Review receivable reductions from customer returns.">
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <input
            className={inputClassName}
            placeholder="Search CM / return / invoice / customer"
            value={creditListFilters.search}
            onChange={(e) => setCreditListFilters((prev) => ({ ...prev, search: e.target.value }))}
          />

          <input
            type="date"
            className={inputClassName}
            value={creditListFilters.date_from}
            onChange={(e) => setCreditListFilters((prev) => ({ ...prev, date_from: e.target.value }))}
          />

          <input
            type="date"
            className={inputClassName}
            value={creditListFilters.date_to}
            onChange={(e) => setCreditListFilters((prev) => ({ ...prev, date_to: e.target.value }))}
          />

          <select
            className={inputClassName}
            value={creditListFilters.sales_invoice_id}
            onChange={(e) => setCreditListFilters((prev) => ({ ...prev, sales_invoice_id: e.target.value }))}
          >
            <option value="">All Sales Invoices</option>
            {salesInvoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.invoice_number}
              </option>
            ))}
          </select>
        </div>

        {creditMemos.length === 0 ? (
          <EmptyState message="No AR credit memos found." />
        ) : (
          <div className="space-y-4">
            {creditMemos.map((memo) => (
              <div
                key={memo.id}
                className="overflow-hidden rounded-3xl border border-[#ebe4f7] bg-white shadow-sm"
              >
                <div className="border-b border-[#ebe4f7] bg-[#faf7ff] px-4 py-4 sm:px-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-[#4d3188]">{memo.credit_memo_number}</h3>
                      <p className="mt-1 text-sm text-[#7c7494]">
                        Invoice: {memo.invoice_number} | Return: {memo.return_number}
                      </p>
                      <p className="mt-1 text-sm text-[#7c7494]">
                        Customer: {memo.customer_name} | Date: {memo.credit_date}
                      </p>
                      <p className="mt-1 text-sm text-[#6e6487]">{memo.remarks || '-'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
                      <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                        <p className="text-xs text-[#7c7494]">Status</p>
                        <p className="text-sm font-bold text-[#4d3188]">{memo.status}</p>
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                        <p className="text-xs text-[#7c7494]">Total Credit</p>
                        <p className="text-sm font-bold text-[#4d3188]">{money(memo.total_amount)}</p>
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
                        <th className="px-6 py-4">Qty</th>
                        <th className="px-6 py-4">Unit Price</th>
                        <th className="px-6 py-4">Line Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memo.items.map((item) => (
                        <tr key={item.id} className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]">
                          <td className="px-6 py-4">{item.sku}</td>
                          <td className="px-6 py-4">{item.product_name}</td>
                          <td className="px-6 py-4">{item.quantity}</td>
                          <td className="px-6 py-4">{money(item.unit_price)}</td>
                          <td className="px-6 py-4">{money(item.line_total)}</td>
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