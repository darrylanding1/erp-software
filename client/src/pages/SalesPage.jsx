import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import { getProducts } from '../services/productService';
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getSalesInvoices,
  createSalesInvoice,
  getCustomerPayments,
  createCustomerPayment,
  getArAgingReport,
  getCustomerLedger,
} from '../services/salesService';

const today = new Date().toISOString().split('T')[0];

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none transition focus:border-[#9b6bff]';

const money = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const initialCustomerForm = {
  customer_code: '',
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  address: '',
  status: 'Active',
};

const initialInvoiceItem = {
  product_id: '',
  quantity: 1,
  unit_price: '',
};

const initialInvoiceForm = {
  customer_id: '',
  invoice_date: today,
  due_date: today,
  remarks: '',
  items: [initialInvoiceItem],
};

const initialPaymentForm = {
  sales_invoice_id: '',
  payment_date: today,
  payment_method: 'Cash',
  reference_number: '',
  amount_paid: '',
  remarks: '',
};

export default function SalesPage() {
  const [activeTab, setActiveTab] = useState('customers');

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [customerPayments, setCustomerPayments] = useState([]);

  const [customerForm, setCustomerForm] = useState(initialCustomerForm);
  const [editingCustomer, setEditingCustomer] = useState(null);

  const [invoiceForm, setInvoiceForm] = useState(initialInvoiceForm);
  const [paymentForm, setPaymentForm] = useState(initialPaymentForm);

  const [arAging, setArAging] = useState({
    summary: {
      as_of_date: today,
      total_customers: 0,
      total_balance: 0,
      current: 0,
      bucket_1_30: 0,
      bucket_31_60: 0,
      bucket_61_90: 0,
      bucket_over_90: 0,
    },
    customers: [],
  });

  const [customerLedger, setCustomerLedger] = useState({
    customer: null,
    summary: {
      total_debit: 0,
      total_credit: 0,
      closing_balance: 0,
    },
    items: [],
  });

  const [ledgerFilters, setLedgerFilters] = useState({
    customer_id: '',
    date_from: '',
    date_to: '',
  });

  const [agingFilters, setAgingFilters] = useState({
    customer_id: '',
    as_of_date: today,
  });

  const [customerFilters, setCustomerFilters] = useState({
    search: '',
    status: '',
  });

  const [invoiceFilters, setInvoiceFilters] = useState({
    customer_id: '',
    status: '',
    date_from: '',
    date_to: '',
    search: '',
  });

  const [paymentFilters, setPaymentFilters] = useState({
    customer_id: '',
    sales_invoice_id: '',
    date_from: '',
    date_to: '',
  });

  const fetchCustomers = async (params = customerFilters) => {
    try {
      const data = await getCustomers(params);
      setCustomers(data || []);
    } catch (error) {
      console.error('Fetch customers failed:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data || []);
    } catch (error) {
      console.error('Fetch products failed:', error);
    }
  };

  const fetchInvoices = async (params = invoiceFilters) => {
    try {
      const data = await getSalesInvoices(params);
      setSalesInvoices(data || []);
    } catch (error) {
      console.error('Fetch sales invoices failed:', error);
    }
  };

  const fetchPayments = async (params = paymentFilters) => {
    try {
      const data = await getCustomerPayments(params);
      setCustomerPayments(data || []);
    } catch (error) {
      console.error('Fetch customer payments failed:', error);
    }
  };

  const fetchAging = async (params = agingFilters) => {
    try {
      const data = await getArAgingReport(params);
      setArAging(data);
    } catch (error) {
      console.error('Fetch AR aging failed:', error);
    }
  };

  const fetchLedger = async (params = ledgerFilters) => {
    if (!params.customer_id) {
      setCustomerLedger({
        customer: null,
        summary: {
          total_debit: 0,
          total_credit: 0,
          closing_balance: 0,
        },
        items: [],
      });
      return;
    }

    try {
      const data = await getCustomerLedger(params);
      setCustomerLedger(data);
    } catch (error) {
      console.error('Fetch customer ledger failed:', error);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchProducts();
    fetchInvoices();
    fetchPayments();
    fetchAging();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => fetchCustomers(customerFilters), 300);
    return () => clearTimeout(timeout);
  }, [customerFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchInvoices(invoiceFilters), 300);
    return () => clearTimeout(timeout);
  }, [invoiceFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchPayments(paymentFilters), 300);
    return () => clearTimeout(timeout);
  }, [paymentFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchAging(agingFilters), 300);
    return () => clearTimeout(timeout);
  }, [agingFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => fetchLedger(ledgerFilters), 300);
    return () => clearTimeout(timeout);
  }, [ledgerFilters]);

  const headerStats = useMemo(
    () => [
      { label: 'Customers', value: customers.length },
      { label: 'Invoices', value: salesInvoices.length },
      { label: 'Open AR', value: money(arAging.summary.total_balance) },
    ],
    [customers.length, salesInvoices.length, arAging.summary.total_balance]
  );

  const resetCustomerForm = () => {
    setCustomerForm(initialCustomerForm);
    setEditingCustomer(null);
  };

  const handleSaveCustomer = async (e) => {
    e.preventDefault();

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, customerForm);
      } else {
        await createCustomer(customerForm);
      }

      resetCustomerForm();
      fetchCustomers();
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to save customer');
    }
  };

  const handleEditCustomer = (customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      customer_code: customer.customer_code || '',
      name: customer.name || '',
      contact_person: customer.contact_person || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      status: customer.status || 'Active',
    });
    setActiveTab('customers');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteCustomer = async (id) => {
    const confirmed = window.confirm('Delete this customer?');
    if (!confirmed) return;

    try {
      await deleteCustomer(id);
      fetchCustomers();
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to delete customer');
    }
  };

  const handleInvoiceItemChange = (index, field, value) => {
    setInvoiceForm((prev) => {
      const nextItems = [...prev.items];
      nextItems[index] = {
        ...nextItems[index],
        [field]: value,
      };
      return { ...prev, items: nextItems };
    });
  };

  const handleAddInvoiceItem = () => {
    setInvoiceForm((prev) => ({
      ...prev,
      items: [...prev.items, { ...initialInvoiceItem }],
    }));
  };

  const handleRemoveInvoiceItem = (index) => {
    setInvoiceForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const invoiceTotal = useMemo(() => {
    return invoiceForm.items.reduce((sum, item) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.unit_price || 0);
      return sum + qty * price;
    }, 0);
  }, [invoiceForm.items]);

  const handleCreateInvoice = async (e) => {
    e.preventDefault();

    try {
      await createSalesInvoice({
        ...invoiceForm,
        customer_id: Number(invoiceForm.customer_id),
        items: invoiceForm.items.map((item) => ({
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
        })),
      });

      setInvoiceForm(initialInvoiceForm);
      fetchInvoices();
      fetchAging();
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to create sales invoice');
    }
  };

  const handleCreatePayment = async (e) => {
    e.preventDefault();

    try {
      await createCustomerPayment({
        ...paymentForm,
        sales_invoice_id: Number(paymentForm.sales_invoice_id),
        amount_paid: Number(paymentForm.amount_paid),
      });

      setPaymentForm(initialPaymentForm);
      fetchInvoices();
      fetchPayments();
      fetchAging();
      fetchLedger(ledgerFilters);
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to create customer payment');
    }
  };

  const openInvoices = salesInvoices.filter(
    (invoice) => Number(invoice.balance || 0) > 0 && invoice.status !== 'Cancelled'
  );

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Sales & Receivables"
        subtitle="Manage customers, sales invoices, customer payments, AR aging, and customer ledger."
        stats={headerStats}
        actions={
          <div className="flex flex-wrap gap-2">
            <AppButton
              type="button"
              variant={activeTab === 'customers' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('customers')}
            >
              Customers
            </AppButton>
            <AppButton
              type="button"
              variant={activeTab === 'invoices' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('invoices')}
            >
              Sales Invoice
            </AppButton>
            <AppButton
              type="button"
              variant={activeTab === 'payments' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('payments')}
            >
              Customer Payments
            </AppButton>
            <AppButton
              type="button"
              variant={activeTab === 'aging' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('aging')}
            >
              AR Aging
            </AppButton>
            <AppButton
              type="button"
              variant={activeTab === 'ledger' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('ledger')}
            >
              Customer Ledger
            </AppButton>
          </div>
        }
      />

      {activeTab === 'customers' && (
        <>
          <SectionCard
            title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
            subtitle="Create and manage customer records."
            action={
              editingCustomer ? (
                <AppButton type="button" variant="secondary" onClick={resetCustomerForm}>
                  Cancel
                </AppButton>
              ) : null
            }
          >
            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <input
                  className={inputClassName}
                  placeholder="Customer Code"
                  value={customerForm.customer_code}
                  onChange={(e) =>
                    setCustomerForm((prev) => ({ ...prev, customer_code: e.target.value }))
                  }
                  required
                />
                <input
                  className={inputClassName}
                  placeholder="Customer Name"
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
                <input
                  className={inputClassName}
                  placeholder="Contact Person"
                  value={customerForm.contact_person}
                  onChange={(e) =>
                    setCustomerForm((prev) => ({ ...prev, contact_person: e.target.value }))
                  }
                />
                <input
                  className={inputClassName}
                  placeholder="Email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm((prev) => ({ ...prev, email: e.target.value }))}
                />
                <input
                  className={inputClassName}
                  placeholder="Phone"
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm((prev) => ({ ...prev, phone: e.target.value }))}
                />
                <select
                  className={inputClassName}
                  value={customerForm.status}
                  onChange={(e) => setCustomerForm((prev) => ({ ...prev, status: e.target.value }))}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <textarea
                className={inputClassName}
                rows={3}
                placeholder="Address"
                value={customerForm.address}
                onChange={(e) => setCustomerForm((prev) => ({ ...prev, address: e.target.value }))}
              />

              <div className="flex gap-3">
                <AppButton type="submit">
                  {editingCustomer ? 'Update Customer' : 'Save Customer'}
                </AppButton>
                {editingCustomer && (
                  <AppButton type="button" variant="secondary" onClick={resetCustomerForm}>
                    Cancel Edit
                  </AppButton>
                )}
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Customer List" subtitle="Search and manage customers.">
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <input
                className={inputClassName}
                placeholder="Search customer"
                value={customerFilters.search}
                onChange={(e) =>
                  setCustomerFilters((prev) => ({ ...prev, search: e.target.value }))
                }
              />
              <select
                className={inputClassName}
                value={customerFilters.status}
                onChange={(e) =>
                  setCustomerFilters((prev) => ({ ...prev, status: e.target.value }))
                }
              >
                <option value="">All Status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            {customers.length === 0 ? (
              <EmptyState message="No customers found." />
            ) : (
              <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
                <table className="min-w-full text-center">
                  <thead className="bg-[#f7f2ff]">
                    <tr className="text-[#4d3188]">
                      <th className="px-6 py-4">Code</th>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-6 py-4">Contact</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Phone</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => (
                      <tr
                        key={customer.id}
                        className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]"
                      >
                        <td className="px-6 py-4 font-semibold">{customer.customer_code}</td>
                        <td className="px-6 py-4">{customer.name}</td>
                        <td className="px-6 py-4">{customer.contact_person || '-'}</td>
                        <td className="px-6 py-4">{customer.email || '-'}</td>
                        <td className="px-6 py-4">{customer.phone || '-'}</td>
                        <td className="px-6 py-4">{customer.status}</td>
                        <td className="px-6 py-4">
                          <div className="flex justify-center gap-2">
                            <AppButton
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditCustomer(customer)}
                            >
                              Edit
                            </AppButton>
                            <AppButton
                              type="button"
                              size="sm"
                              variant="danger"
                              onClick={() => handleDeleteCustomer(customer.id)}
                            >
                              Delete
                            </AppButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      {activeTab === 'invoices' && (
        <>
          <SectionCard
            title="Create Sales Invoice"
            subtitle="Create a posted sales invoice with automatic journal posting."
          >
            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <select
                  className={inputClassName}
                  value={invoiceForm.customer_id}
                  onChange={(e) =>
                    setInvoiceForm((prev) => ({ ...prev, customer_id: e.target.value }))
                  }
                  required
                >
                  <option value="">Select Customer</option>
                  {customers
                    .filter((customer) => customer.status === 'Active')
                    .map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.customer_code} - {customer.name}
                      </option>
                    ))}
                </select>

                <input
                  type="date"
                  className={inputClassName}
                  value={invoiceForm.invoice_date}
                  onChange={(e) =>
                    setInvoiceForm((prev) => ({ ...prev, invoice_date: e.target.value }))
                  }
                  required
                />

                <input
                  type="date"
                  className={inputClassName}
                  value={invoiceForm.due_date}
                  onChange={(e) =>
                    setInvoiceForm((prev) => ({ ...prev, due_date: e.target.value }))
                  }
                />
              </div>

              <textarea
                className={inputClassName}
                rows={2}
                placeholder="Remarks"
                value={invoiceForm.remarks}
                onChange={(e) => setInvoiceForm((prev) => ({ ...prev, remarks: e.target.value }))}
              />

              <div className="space-y-3">
                {invoiceForm.items.map((item, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-1 gap-3 rounded-2xl border border-[#ebe4f7] bg-[#fcfaff] p-4 md:grid-cols-4"
                  >
                    <select
                      className={inputClassName}
                      value={item.product_id}
                      onChange={(e) => handleInvoiceItemChange(index, 'product_id', e.target.value)}
                      required
                    >
                      <option value="">Select Product</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.sku} - {product.name}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      min="1"
                      className={inputClassName}
                      placeholder="Quantity"
                      value={item.quantity}
                      onChange={(e) => handleInvoiceItemChange(index, 'quantity', e.target.value)}
                      required
                    />

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className={inputClassName}
                      placeholder="Unit Price"
                      value={item.unit_price}
                      onChange={(e) => handleInvoiceItemChange(index, 'unit_price', e.target.value)}
                      required
                    />

                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm text-[#4d3188]">
                        Line Total:{' '}
                        {money(Number(item.quantity || 0) * Number(item.unit_price || 0))}
                      </div>
                      {invoiceForm.items.length > 1 && (
                        <AppButton
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => handleRemoveInvoiceItem(index)}
                        >
                          Remove
                        </AppButton>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <AppButton type="button" variant="secondary" onClick={handleAddInvoiceItem}>
                  Add Item
                </AppButton>
                <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 font-semibold text-[#4d3188]">
                  Invoice Total: {money(invoiceTotal)}
                </div>
              </div>

              <AppButton type="submit">Post Sales Invoice</AppButton>
            </form>
          </SectionCard>

          <SectionCard
            title="Sales Invoice List"
            subtitle="Review customer invoices, delivery progress, credits, and balances."
          >
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <select
                className={inputClassName}
                value={invoiceFilters.customer_id}
                onChange={(e) =>
                  setInvoiceFilters((prev) => ({ ...prev, customer_id: e.target.value }))
                }
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
                value={invoiceFilters.status}
                onChange={(e) =>
                  setInvoiceFilters((prev) => ({ ...prev, status: e.target.value }))
                }
              >
                <option value="">All Status</option>
                <option value="Draft">Draft</option>
                <option value="Posted">Posted</option>
                <option value="Partially Paid">Partially Paid</option>
                <option value="Paid">Paid</option>
                <option value="Cancelled">Cancelled</option>
              </select>

              <input
                type="date"
                className={inputClassName}
                value={invoiceFilters.date_from}
                onChange={(e) =>
                  setInvoiceFilters((prev) => ({ ...prev, date_from: e.target.value }))
                }
              />

              <input
                type="date"
                className={inputClassName}
                value={invoiceFilters.date_to}
                onChange={(e) =>
                  setInvoiceFilters((prev) => ({ ...prev, date_to: e.target.value }))
                }
              />

              <input
                className={inputClassName}
                placeholder="Search invoice/customer"
                value={invoiceFilters.search}
                onChange={(e) =>
                  setInvoiceFilters((prev) => ({ ...prev, search: e.target.value }))
                }
              />
            </div>

            {salesInvoices.length === 0 ? (
              <EmptyState message="No sales invoices found." />
            ) : (
              <div className="space-y-4">
                {salesInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="overflow-hidden rounded-3xl border border-[#ebe4f7] bg-white shadow-sm"
                  >
                    <div className="border-b border-[#ebe4f7] bg-[#faf7ff] px-4 py-4 sm:px-6">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-[#4d3188]">
                            {invoice.invoice_number}
                          </h3>
                          <p className="mt-1 text-sm text-[#7c7494]">
                            {invoice.customer_name} | {invoice.invoice_date} | Due:{' '}
                            {invoice.due_date || '-'}
                          </p>
                          <p className="mt-1 text-sm text-[#7c7494]">
                            Delivery Status: {invoice.delivery_status || 'Not Delivered'} | Billed
                            Qty: {invoice.billed_quantity ?? 0} | Delivered Qty:{' '}
                            {invoice.delivered_quantity ?? 0} | Returned Qty:{' '}
                            {invoice.returned_quantity ?? 0} | Credited Qty:{' '}
                            {invoice.credited_quantity ?? 0}
                          </p>
                          <p className="mt-1 text-sm text-[#6e6487]">{invoice.remarks || '-'}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
                          <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                            <p className="text-xs text-[#7c7494]">Status</p>
                            <p className="text-sm font-bold text-[#4d3188]">{invoice.status}</p>
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                            <p className="text-xs text-[#7c7494]">Total</p>
                            <p className="text-sm font-bold text-[#4d3188]">
                              {money(invoice.total_amount)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                            <p className="text-xs text-[#7c7494]">Paid</p>
                            <p className="text-sm font-bold text-[#4d3188]">
                              {money(invoice.total_paid)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                            <p className="text-xs text-[#7c7494]">Credited</p>
                            <p className="text-sm font-bold text-[#4d3188]">
                              {money(invoice.total_credited)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                            <p className="text-xs text-[#7c7494]">Balance</p>
                            <p className="text-sm font-bold text-[#4d3188]">
                              {money(invoice.balance)}
                            </p>
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
                            <th className="px-6 py-4">Delivered Qty</th>
                            <th className="px-6 py-4">Returned Qty</th>
                            <th className="px-6 py-4">Credited Qty</th>
                            <th className="px-6 py-4">Remaining</th>
                            <th className="px-6 py-4">Unit Price</th>
                            <th className="px-6 py-4">Line Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoice.items.map((item) => (
                            <tr
                              key={item.id}
                              className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]"
                            >
                              <td className="px-6 py-4">{item.sku}</td>
                              <td className="px-6 py-4">{item.product_name}</td>
                              <td className="px-6 py-4">{item.quantity}</td>
                              <td className="px-6 py-4">{item.delivered_quantity ?? 0}</td>
                              <td className="px-6 py-4">{item.returned_quantity ?? 0}</td>
                              <td className="px-6 py-4">{item.credited_quantity ?? 0}</td>
                              <td className="px-6 py-4">
                                {item.remaining_to_deliver ?? item.quantity}
                              </td>
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
        </>
      )}

      {activeTab === 'payments' && (
        <>
          <SectionCard
            title="Create Customer Payment"
            subtitle="Post customer payment with automatic journal posting."
          >
            <form onSubmit={handleCreatePayment} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <select
                  className={inputClassName}
                  value={paymentForm.sales_invoice_id}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, sales_invoice_id: e.target.value }))
                  }
                  required
                >
                  <option value="">Select Open Invoice</option>
                  {openInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoice_number} - {invoice.customer_name} - Bal{' '}
                      {money(invoice.balance)}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  className={inputClassName}
                  value={paymentForm.payment_date}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, payment_date: e.target.value }))
                  }
                  required
                />

                <select
                  className={inputClassName}
                  value={paymentForm.payment_method}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, payment_method: e.target.value }))
                  }
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
                  value={paymentForm.reference_number}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, reference_number: e.target.value }))
                  }
                />

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className={inputClassName}
                  placeholder="Amount Paid"
                  value={paymentForm.amount_paid}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, amount_paid: e.target.value }))
                  }
                  required
                />
              </div>

              <textarea
                className={inputClassName}
                rows={2}
                placeholder="Remarks"
                value={paymentForm.remarks}
                onChange={(e) => setPaymentForm((prev) => ({ ...prev, remarks: e.target.value }))}
              />

              <AppButton type="submit">Post Customer Payment</AppButton>
            </form>
          </SectionCard>

          <SectionCard title="Customer Payment List" subtitle="Review all customer receipts.">
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <select
                className={inputClassName}
                value={paymentFilters.customer_id}
                onChange={(e) =>
                  setPaymentFilters((prev) => ({ ...prev, customer_id: e.target.value }))
                }
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
                value={paymentFilters.sales_invoice_id}
                onChange={(e) =>
                  setPaymentFilters((prev) => ({ ...prev, sales_invoice_id: e.target.value }))
                }
              >
                <option value="">All Invoices</option>
                {salesInvoices.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.invoice_number}
                  </option>
                ))}
              </select>

              <input
                type="date"
                className={inputClassName}
                value={paymentFilters.date_from}
                onChange={(e) =>
                  setPaymentFilters((prev) => ({ ...prev, date_from: e.target.value }))
                }
              />

              <input
                type="date"
                className={inputClassName}
                value={paymentFilters.date_to}
                onChange={(e) =>
                  setPaymentFilters((prev) => ({ ...prev, date_to: e.target.value }))
                }
              />
            </div>

            {customerPayments.length === 0 ? (
              <EmptyState message="No customer payments found." />
            ) : (
              <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
                <table className="min-w-full text-center">
                  <thead className="bg-[#f7f2ff]">
                    <tr className="text-[#4d3188]">
                      <th className="px-6 py-4">Payment No.</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Customer</th>
                      <th className="px-6 py-4">Invoice</th>
                      <th className="px-6 py-4">Method</th>
                      <th className="px-6 py-4">Reference</th>
                      <th className="px-6 py-4">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerPayments.map((payment) => (
                      <tr
                        key={payment.id}
                        className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]"
                      >
                        <td className="px-6 py-4 font-semibold">{payment.payment_number}</td>
                        <td className="px-6 py-4">{payment.payment_date}</td>
                        <td className="px-6 py-4">{payment.customer_name}</td>
                        <td className="px-6 py-4">{payment.invoice_number}</td>
                        <td className="px-6 py-4">{payment.payment_method}</td>
                        <td className="px-6 py-4">{payment.reference_number || '-'}</td>
                        <td className="px-6 py-4 font-semibold">{money(payment.amount_paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}

      {activeTab === 'aging' && (
        <>
          <SectionCard
            title="AR Aging Filters"
            subtitle="Review open customer balances by aging bucket."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <select
                className={inputClassName}
                value={agingFilters.customer_id}
                onChange={(e) =>
                  setAgingFilters((prev) => ({ ...prev, customer_id: e.target.value }))
                }
              >
                <option value="">All Customers</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                className={inputClassName}
                value={agingFilters.as_of_date}
                onChange={(e) =>
                  setAgingFilters((prev) => ({ ...prev, as_of_date: e.target.value }))
                }
              />
            </div>
          </SectionCard>

          <SectionCard
            title="AR Aging Report"
            subtitle={`As of ${arAging.summary.as_of_date || today}`}
          >
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">Open AR</p>
                <p className="mt-1 text-lg font-bold text-[#4d3188]">
                  {money(arAging.summary.total_balance)}
                </p>
              </div>
              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">Current</p>
                <p className="mt-1 text-lg font-bold text-[#4d3188]">
                  {money(arAging.summary.current)}
                </p>
              </div>
              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">1-30</p>
                <p className="mt-1 text-lg font-bold text-[#4d3188]">
                  {money(arAging.summary.bucket_1_30)}
                </p>
              </div>
              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">31-60</p>
                <p className="mt-1 text-lg font-bold text-[#4d3188]">
                  {money(arAging.summary.bucket_31_60)}
                </p>
              </div>
              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">61-90</p>
                <p className="mt-1 text-lg font-bold text-[#4d3188]">
                  {money(arAging.summary.bucket_61_90)}
                </p>
              </div>
              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">90+</p>
                <p className="mt-1 text-lg font-bold text-[#4d3188]">
                  {money(arAging.summary.bucket_over_90)}
                </p>
              </div>
            </div>

            {arAging.customers.length === 0 ? (
              <EmptyState message="No open AR balances found." />
            ) : (
              <div className="space-y-4">
                {arAging.customers.map((customer) => (
                  <div
                    key={customer.customer_id}
                    className="overflow-hidden rounded-3xl border border-[#ebe4f7] bg-white shadow-sm"
                  >
                    <div className="border-b border-[#ebe4f7] bg-[#faf7ff] px-4 py-4 sm:px-6">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-[#4d3188]">
                            {customer.customer_name}
                          </h3>
                          <p className="mt-1 text-sm text-[#7c7494]">
                            Total Open Balance: {money(customer.total_balance)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-center">
                        <thead className="bg-[#f7f2ff]">
                          <tr className="text-[#4d3188]">
                            <th className="px-6 py-4">Invoice No.</th>
                            <th className="px-6 py-4">Invoice Date</th>
                            <th className="px-6 py-4">Due Date</th>
                            <th className="px-6 py-4">Balance</th>
                            <th className="px-6 py-4">Age Days</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customer.invoices.map((invoice) => (
                            <tr
                              key={invoice.id}
                              className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]"
                            >
                              <td className="px-6 py-4 font-medium">{invoice.invoice_number}</td>
                              <td className="px-6 py-4">{invoice.invoice_date}</td>
                              <td className="px-6 py-4">{invoice.due_date || '-'}</td>
                              <td className="px-6 py-4 font-semibold">{money(invoice.balance)}</td>
                              <td className="px-6 py-4">{invoice.age_days}</td>
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
        </>
      )}

      {activeTab === 'ledger' && (
        <>
          <SectionCard
            title="Customer Ledger Filters"
            subtitle="Review chronological AR activity per customer."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <select
                className={inputClassName}
                value={ledgerFilters.customer_id}
                onChange={(e) =>
                  setLedgerFilters((prev) => ({ ...prev, customer_id: e.target.value }))
                }
              >
                <option value="">Select Customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>

              <input
                type="date"
                className={inputClassName}
                value={ledgerFilters.date_from}
                onChange={(e) =>
                  setLedgerFilters((prev) => ({ ...prev, date_from: e.target.value }))
                }
              />

              <input
                type="date"
                className={inputClassName}
                value={ledgerFilters.date_to}
                onChange={(e) =>
                  setLedgerFilters((prev) => ({ ...prev, date_to: e.target.value }))
                }
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Customer Ledger"
            subtitle={customerLedger.customer ? customerLedger.customer.name : 'Select a customer'}
          >
            {!customerLedger.customer ? (
              <EmptyState message="Select a customer to view the ledger." />
            ) : (
              <>
                <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                    <p className="text-sm text-[#7c7494]">Invoices</p>
                    <p className="mt-1 text-xl font-bold text-[#4d3188]">
                      {money(customerLedger.summary.total_debit)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                    <p className="text-sm text-[#7c7494]">Payments + Credit Memos</p>
                    <p className="mt-1 text-xl font-bold text-[#4d3188]">
                      {money(customerLedger.summary.total_credit)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                    <p className="text-sm text-[#7c7494]">Closing Balance</p>
                    <p className="mt-1 text-xl font-bold text-[#4d3188]">
                      {money(customerLedger.summary.closing_balance)}
                    </p>
                  </div>
                </div>

                {customerLedger.items.length === 0 ? (
                  <EmptyState message="No ledger transactions found." />
                ) : (
                  <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
                    <table className="min-w-full text-center">
                      <thead className="bg-[#f7f2ff]">
                        <tr className="text-[#4d3188]">
                          <th className="px-6 py-4">Date</th>
                          <th className="px-6 py-4">Type</th>
                          <th className="px-6 py-4">Document</th>
                          <th className="px-6 py-4">Reference</th>
                          <th className="px-6 py-4">Debit</th>
                          <th className="px-6 py-4">Credit</th>
                          <th className="px-6 py-4">Running Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {customerLedger.items.map((item) => (
                          <tr
                            key={item.id}
                            className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]"
                          >
                            <td className="px-6 py-4">{item.transaction_date}</td>
                            <td className="px-6 py-4">{item.transaction_type}</td>
                            <td className="px-6 py-4">{item.document_number}</td>
                            <td className="px-6 py-4">{item.reference_number || '-'}</td>
                            <td className="px-6 py-4">{money(item.debit)}</td>
                            <td className="px-6 py-4">{money(item.credit)}</td>
                            <td className="px-6 py-4 font-semibold">
                              {money(item.running_balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}