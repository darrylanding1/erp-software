import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import PermissionGate from '../components/auth/PermissionGate';
import { getCustomers } from '../services/customerService';
import { getSalesInvoices } from '../services/salesService';
import {
  getRefundCandidates,
  getCustomerRefunds,
  createCustomerRefund,
} from '../services/customerRefundService';

const today = new Date().toISOString().split('T')[0];

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none transition focus:border-[#9b6bff]';

const money = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function CustomerRefundPage() {
  const [customers, setCustomers] = useState([]);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [refunds, setRefunds] = useState([]);

  const [filters, setFilters] = useState({
    customer_id: '',
    sales_invoice_id: '',
  });

  const [selectedCreditMemoId, setSelectedCreditMemoId] = useState('');
  const [refundDate, setRefundDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [amountRefunded, setAmountRefunded] = useState('');
  const [remarks, setRemarks] = useState('');

  const [listFilters, setListFilters] = useState({
    customer_id: '',
    sales_invoice_id: '',
    date_from: '',
    date_to: '',
    search: '',
  });

  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [customerData, invoiceData] = await Promise.all([
          getCustomers(),
          getSalesInvoices(),
        ]);

        setCustomers(customerData || []);
        setSalesInvoices(invoiceData || []);
      } catch (error) {
        console.error('Load refund master data failed:', error);
      }
    };

    loadMasterData();
  }, []);

  const fetchCandidates = async (params = filters) => {
    try {
      const data = await getRefundCandidates(params);
      setCandidates(data || []);
    } catch (error) {
      console.error('Fetch refund candidates failed:', error);
    }
  };

  const fetchRefunds = async (params = listFilters) => {
    try {
      const data = await getCustomerRefunds(params);
      setRefunds(data || []);
    } catch (error) {
      console.error('Fetch customer refunds failed:', error);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => fetchCandidates(filters), 250);
    return () => clearTimeout(timeout);
  }, [filters]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchRefunds(listFilters), 250);
    return () => clearTimeout(timeout);
  }, [listFilters]);

  const selectedCreditMemo = useMemo(
    () => candidates.find((item) => String(item.id) === String(selectedCreditMemoId)),
    [candidates, selectedCreditMemoId]
  );

  useEffect(() => {
    if (!selectedCreditMemo) {
      setAmountRefunded('');
      return;
    }

    setAmountRefunded(selectedCreditMemo.refundable_amount);
  }, [selectedCreditMemo]);

  const handleCreateRefund = async (e) => {
    e.preventDefault();

    if (!selectedCreditMemo) {
      alert('Select a refundable credit memo first.');
      return;
    }

    try {
      await createCustomerRefund({
        ar_credit_memo_id: Number(selectedCreditMemo.id),
        refund_date: refundDate,
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        amount_refunded: Number(amountRefunded || 0),
        remarks,
      });

      setSelectedCreditMemoId('');
      setReferenceNumber('');
      setAmountRefunded('');
      setRemarks('');

      fetchCandidates(filters);
      fetchRefunds(listFilters);

      alert('Customer refund posted successfully.');
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to create customer refund');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Refunds"
        subtitle="Refund customer credits created by sales returns and AR credit memos."
      />

      <SectionCard
        title="Create Customer Refund"
        subtitle="Use this when the sales invoice was already fully paid and the return should create a cash-out."
      >
        <form className="space-y-4" onSubmit={handleCreateRefund}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <select
              className={inputClassName}
              value={filters.customer_id}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, customer_id: e.target.value }));
                setSelectedCreditMemoId('');
              }}
            >
              <option value="">All Customers</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>

            <select
              className={inputClassName}
              value={filters.sales_invoice_id}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, sales_invoice_id: e.target.value }));
                setSelectedCreditMemoId('');
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
              value={refundDate}
              onChange={(e) => setRefundDate(e.target.value)}
            />

            <select
              className={inputClassName}
              value={selectedCreditMemoId}
              onChange={(e) => setSelectedCreditMemoId(e.target.value)}
            >
              <option value="">Select Credit Memo</option>
              {candidates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.credit_memo_number} | {item.invoice_number} | {item.customer_name}
                </option>
              ))}
            </select>
          </div>

          {selectedCreditMemo ? (
            <div className="grid grid-cols-1 gap-4 rounded-3xl border border-[#ebe4f7] bg-[#faf7ff] p-4 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <p className="text-xs text-[#7c7494]">Customer</p>
                <p className="font-semibold text-[#4d3188]">{selectedCreditMemo.customer_name}</p>
              </div>
              <div>
                <p className="text-xs text-[#7c7494]">Invoice</p>
                <p className="font-semibold text-[#4d3188]">{selectedCreditMemo.invoice_number}</p>
              </div>
              <div>
                <p className="text-xs text-[#7c7494]">Credit Memo</p>
                <p className="font-semibold text-[#4d3188]">{selectedCreditMemo.credit_memo_number}</p>
              </div>
              <div>
                <p className="text-xs text-[#7c7494]">Credit Amount</p>
                <p className="font-semibold text-[#4d3188]">{money(selectedCreditMemo.total_amount)}</p>
              </div>
              <div>
                <p className="text-xs text-[#7c7494]">Refundable</p>
                <p className="font-semibold text-[#4d3188]">{money(selectedCreditMemo.refundable_amount)}</p>
              </div>
            </div>
          ) : (
            <EmptyState message="Select a credit memo with refundable balance." />
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <select
              className={inputClassName}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Check">Check</option>
              <option value="GCash">GCash</option>
              <option value="Other">Other</option>
            </select>

            <input
              className={inputClassName}
              placeholder="Reference Number"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />

            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClassName}
              placeholder="Refund Amount"
              value={amountRefunded}
              onChange={(e) => setAmountRefunded(e.target.value)}
            />
          </div>

          <textarea
            className={inputClassName}
            rows={3}
            placeholder="Refund remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />

          <PermissionGate permission="customer_refunds.create">
            <AppButton type="submit">Post Customer Refund</AppButton>
          </PermissionGate>
        </form>
      </SectionCard>

      <SectionCard
        title="Customer Refund List"
        subtitle="Review posted customer cash refunds."
      >
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <input
            className={inputClassName}
            placeholder="Search refund / credit memo / invoice / customer"
            value={listFilters.search}
            onChange={(e) => setListFilters((prev) => ({ ...prev, search: e.target.value }))}
          />

          <select
            className={inputClassName}
            value={listFilters.customer_id}
            onChange={(e) => setListFilters((prev) => ({ ...prev, customer_id: e.target.value }))}
          >
            <option value="">All Customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>

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
        </div>

        {refunds.length === 0 ? (
          <EmptyState message="No customer refunds found." />
        ) : (
          <div className="overflow-hidden rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-center">
                <thead className="bg-[#f7f2ff]">
                  <tr className="text-[#4d3188]">
                    <th className="px-6 py-4">Refund No.</th>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Invoice</th>
                    <th className="px-6 py-4">Credit Memo</th>
                    <th className="px-6 py-4">Method</th>
                    <th className="px-6 py-4">Reference</th>
                    <th className="px-6 py-4">Amount</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((item) => (
                    <tr key={item.id} className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]">
                      <td className="px-6 py-4">{item.refund_number}</td>
                      <td className="px-6 py-4">{item.refund_date}</td>
                      <td className="px-6 py-4">{item.customer_name}</td>
                      <td className="px-6 py-4">{item.invoice_number}</td>
                      <td className="px-6 py-4">{item.credit_memo_number}</td>
                      <td className="px-6 py-4">{item.payment_method}</td>
                      <td className="px-6 py-4">{item.reference_number || '-'}</td>
                      <td className="px-6 py-4">{money(item.amount_refunded)}</td>
                      <td className="px-6 py-4">{item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
