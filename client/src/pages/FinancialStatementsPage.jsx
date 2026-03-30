import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import {
  getFinancialReportMeta,
  getTrialBalance,
  getGeneralLedger,
  getBalanceSheet,
  getProfitAndLoss,
  getArAgingReport,
  getApAgingReport,
} from '../services/financialReportService';

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] bg-white px-4 py-3 outline-none transition focus:border-[#9b6bff]';

const today = new Date().toISOString().split('T')[0];
const monthStart = `${today.slice(0, 8)}01`;

const money = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const tabButtonClass = (active) =>
  active
    ? 'bg-[#9b6bff] text-white border border-[#9b6bff]'
    : 'bg-white text-[#4d3188] border border-[#ebe4f7] hover:bg-[#f7f2ff]';

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-3xl border border-[#ebe4f7] bg-white p-4 shadow-sm">
      <p className="text-sm text-[#7c7494]">{label}</p>
      <h3 className="mt-2 text-2xl font-bold text-[#4d3188]">{value}</h3>
    </div>
  );
}

function DataTable({ columns, rows, emptyMessage = 'No data found.' }) {
  if (!rows?.length) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
      <table className="min-w-full text-center">
        <thead className="bg-[#f7f2ff]">
          <tr className="text-[#4d3188]">
            {columns.map((column) => (
              <th key={column.key} className="px-4 py-4 text-center text-sm font-semibold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.id ?? row.entry_number ?? row.invoice_number ?? rowIndex}
              className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]"
            >
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-4 text-sm text-[#2b2340]">
                  {column.render ? column.render(row) : row[column.key] ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatementTable({ title, rows, totalLabel, totalValue }) {
  return (
    <SectionCard title={title}>
      {!rows?.length ? (
        <EmptyState message={`No ${title.toLowerCase()} found.`} />
      ) : (
        <>
          <DataTable
            rows={rows}
            columns={[
              { key: 'account_code', label: 'Code' },
              { key: 'account_name', label: 'Account Name' },
              {
                key: 'amount',
                label: 'Amount',
                render: (row) => <span className="font-semibold">{money(row.amount)}</span>,
              },
            ]}
          />
          <div className="mt-4 flex justify-end">
            <div className="rounded-2xl bg-[#f7f2ff] px-5 py-3 text-sm font-semibold text-[#4d3188]">
              {totalLabel}: {money(totalValue)}
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

export default function FinancialStatementsPage() {
  const [activeTab, setActiveTab] = useState('trial-balance');
  const [meta, setMeta] = useState({
    accounts: [],
    customers: [],
    suppliers: [],
  });

  const [trialBalanceFilters, setTrialBalanceFilters] = useState({
    date_from: monthStart,
    date_to: today,
    account_type: '',
    account_id: '',
    include_zero: 'false',
  });
  const [trialBalanceData, setTrialBalanceData] = useState({
    summary: {
      opening_debit: 0,
      opening_credit: 0,
      period_debit: 0,
      period_credit: 0,
      ending_debit: 0,
      ending_credit: 0,
    },
    items: [],
  });
  const [loadingTrialBalance, setLoadingTrialBalance] = useState(false);

  const [generalLedgerFilters, setGeneralLedgerFilters] = useState({
    account_id: '',
    date_from: monthStart,
    date_to: today,
  });
  const [generalLedgerData, setGeneralLedgerData] = useState({
    account: null,
    summary: {
      opening_balance: 0,
      total_debit: 0,
      total_credit: 0,
      closing_balance: 0,
    },
    items: [],
  });
  const [loadingGeneralLedger, setLoadingGeneralLedger] = useState(false);

  const [balanceSheetFilters, setBalanceSheetFilters] = useState({
    as_of_date: today,
  });
  const [balanceSheetData, setBalanceSheetData] = useState({
    as_of_date: today,
    assets: [],
    liabilities: [],
    equity: [],
    summary: {
      total_assets: 0,
      total_liabilities: 0,
      total_equity: 0,
      total_liabilities_and_equity: 0,
      balanced: true,
      difference: 0,
    },
  });
  const [loadingBalanceSheet, setLoadingBalanceSheet] = useState(false);

  const [profitLossFilters, setProfitLossFilters] = useState({
    date_from: monthStart,
    date_to: today,
  });
  const [profitLossData, setProfitLossData] = useState({
    revenues: [],
    expenses: [],
    summary: {
      total_revenue: 0,
      total_expense: 0,
      net_income: 0,
    },
  });
  const [loadingProfitLoss, setLoadingProfitLoss] = useState(false);

  const [arAgingFilters, setArAgingFilters] = useState({
    customer_id: '',
    as_of_date: today,
  });
  const [arAgingData, setArAgingData] = useState({
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
  const [loadingArAging, setLoadingArAging] = useState(false);

  const [apAgingFilters, setApAgingFilters] = useState({
    supplier_id: '',
    as_of_date: today,
  });
  const [apAgingData, setApAgingData] = useState({
    summary: {
      as_of_date: today,
      total_suppliers: 0,
      total_balance: 0,
      current: 0,
      bucket_1_30: 0,
      bucket_31_60: 0,
      bucket_61_90: 0,
      bucket_over_90: 0,
    },
    suppliers: [],
  });
  const [loadingApAging, setLoadingApAging] = useState(false);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const data = await getFinancialReportMeta();
        setMeta(data);

        if (data.accounts?.length) {
          setGeneralLedgerFilters((prev) => ({
            ...prev,
            account_id: prev.account_id || String(data.accounts[0].id),
          }));
        }
      } catch (error) {
        console.error('Failed to load financial report metadata:', error);
      }
    };

    loadMeta();
  }, []);

  const fetchTrialBalance = async (params = trialBalanceFilters) => {
    try {
      setLoadingTrialBalance(true);
      const data = await getTrialBalance(params);
      setTrialBalanceData(data);
    } catch (error) {
      console.error('Failed to fetch trial balance:', error);
      setTrialBalanceData({
        summary: {
          opening_debit: 0,
          opening_credit: 0,
          period_debit: 0,
          period_credit: 0,
          ending_debit: 0,
          ending_credit: 0,
        },
        items: [],
      });
    } finally {
      setLoadingTrialBalance(false);
    }
  };

  const fetchGeneralLedger = async (params = generalLedgerFilters) => {
    if (!params.account_id) return;

    try {
      setLoadingGeneralLedger(true);
      const data = await getGeneralLedger(params);
      setGeneralLedgerData(data);
    } catch (error) {
      console.error('Failed to fetch general ledger:', error);
      setGeneralLedgerData({
        account: null,
        summary: {
          opening_balance: 0,
          total_debit: 0,
          total_credit: 0,
          closing_balance: 0,
        },
        items: [],
      });
    } finally {
      setLoadingGeneralLedger(false);
    }
  };

  const fetchBalanceSheet = async (params = balanceSheetFilters) => {
    try {
      setLoadingBalanceSheet(true);
      const data = await getBalanceSheet(params);
      setBalanceSheetData(data);
    } catch (error) {
      console.error('Failed to fetch balance sheet:', error);
    } finally {
      setLoadingBalanceSheet(false);
    }
  };

  const fetchProfitLoss = async (params = profitLossFilters) => {
    try {
      setLoadingProfitLoss(true);
      const data = await getProfitAndLoss(params);
      setProfitLossData(data);
    } catch (error) {
      console.error('Failed to fetch profit and loss:', error);
    } finally {
      setLoadingProfitLoss(false);
    }
  };

  const fetchArAging = async (params = arAgingFilters) => {
    try {
      setLoadingArAging(true);
      const data = await getArAgingReport(params);
      setArAgingData(data);
    } catch (error) {
      console.error('Failed to fetch AR aging:', error);
    } finally {
      setLoadingArAging(false);
    }
  };

  const fetchApAging = async (params = apAgingFilters) => {
    try {
      setLoadingApAging(true);
      const data = await getApAgingReport(params);
      setApAgingData(data);
    } catch (error) {
      console.error('Failed to fetch AP aging:', error);
    } finally {
      setLoadingApAging(false);
    }
  };

  useEffect(() => {
    fetchTrialBalance();
    fetchBalanceSheet();
    fetchProfitLoss();
    fetchArAging();
    fetchApAging();
  }, []);

  useEffect(() => {
    if (generalLedgerFilters.account_id) {
      fetchGeneralLedger();
    }
  }, [generalLedgerFilters.account_id]);

  const pageStats = useMemo(
    () => [
      { label: 'Assets', value: money(balanceSheetData.summary.total_assets) },
      {
        label: 'Net Income',
        value: money(profitLossData.summary.net_income),
      },
      {
        label: 'Open AR',
        value: money(arAgingData.summary.total_balance),
      },
      {
        label: 'Open AP',
        value: money(apAgingData.summary.total_balance),
      },
    ],
    [
      balanceSheetData.summary.total_assets,
      profitLossData.summary.net_income,
      arAgingData.summary.total_balance,
      apAgingData.summary.total_balance,
    ]
  );

  const renderTrialBalance = () => (
    <div className="space-y-4">
      <SectionCard title="Trial Balance Filters">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Date From</label>
            <input
              type="date"
              className={inputClassName}
              value={trialBalanceFilters.date_from}
              onChange={(e) =>
                setTrialBalanceFilters((prev) => ({ ...prev, date_from: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Date To</label>
            <input
              type="date"
              className={inputClassName}
              value={trialBalanceFilters.date_to}
              onChange={(e) =>
                setTrialBalanceFilters((prev) => ({ ...prev, date_to: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Account Type</label>
            <select
              className={inputClassName}
              value={trialBalanceFilters.account_type}
              onChange={(e) =>
                setTrialBalanceFilters((prev) => ({ ...prev, account_type: e.target.value }))
              }
            >
              <option value="">All</option>
              <option value="Asset">Asset</option>
              <option value="Liability">Liability</option>
              <option value="Equity">Equity</option>
              <option value="Revenue">Revenue</option>
              <option value="Expense">Expense</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Account</label>
            <select
              className={inputClassName}
              value={trialBalanceFilters.account_id}
              onChange={(e) =>
                setTrialBalanceFilters((prev) => ({ ...prev, account_id: e.target.value }))
              }
            >
              <option value="">All Accounts</option>
              {meta.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_code} - {account.account_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-[#6e6487]">
              <input
                type="checkbox"
                checked={trialBalanceFilters.include_zero === 'true'}
                onChange={(e) =>
                  setTrialBalanceFilters((prev) => ({
                    ...prev,
                    include_zero: e.target.checked ? 'true' : 'false',
                  }))
                }
              />
              Include zero rows
            </label>
          </div>
        </div>

        <div className="mt-4">
          <AppButton type="button" variant="primary" onClick={() => fetchTrialBalance()}>
            {loadingTrialBalance ? 'Loading...' : 'Apply'}
          </AppButton>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Opening Debit" value={money(trialBalanceData.summary.opening_debit)} />
        <SummaryCard label="Opening Credit" value={money(trialBalanceData.summary.opening_credit)} />
        <SummaryCard label="Period Debit" value={money(trialBalanceData.summary.period_debit)} />
        <SummaryCard label="Period Credit" value={money(trialBalanceData.summary.period_credit)} />
        <SummaryCard label="Ending Debit" value={money(trialBalanceData.summary.ending_debit)} />
        <SummaryCard label="Ending Credit" value={money(trialBalanceData.summary.ending_credit)} />
      </div>

      <SectionCard title="Trial Balance">
        <DataTable
          rows={trialBalanceData.items}
          columns={[
            { key: 'account_code', label: 'Code' },
            { key: 'account_name', label: 'Account Name' },
            { key: 'account_type', label: 'Type' },
            { key: 'opening_debit', label: 'Opening Dr', render: (row) => money(row.opening_debit) },
            { key: 'opening_credit', label: 'Opening Cr', render: (row) => money(row.opening_credit) },
            { key: 'period_debit', label: 'Period Dr', render: (row) => money(row.period_debit) },
            { key: 'period_credit', label: 'Period Cr', render: (row) => money(row.period_credit) },
            { key: 'ending_debit', label: 'Ending Dr', render: (row) => money(row.ending_debit) },
            { key: 'ending_credit', label: 'Ending Cr', render: (row) => money(row.ending_credit) },
          ]}
          emptyMessage="No trial balance rows found."
        />
      </SectionCard>
    </div>
  );

  const renderGeneralLedger = () => (
    <div className="space-y-4">
      <SectionCard title="General Ledger Filters">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Account</label>
            <select
              className={inputClassName}
              value={generalLedgerFilters.account_id}
              onChange={(e) =>
                setGeneralLedgerFilters((prev) => ({ ...prev, account_id: e.target.value }))
              }
            >
              <option value="">Select account</option>
              {meta.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_code} - {account.account_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Date From</label>
            <input
              type="date"
              className={inputClassName}
              value={generalLedgerFilters.date_from}
              onChange={(e) =>
                setGeneralLedgerFilters((prev) => ({ ...prev, date_from: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Date To</label>
            <input
              type="date"
              className={inputClassName}
              value={generalLedgerFilters.date_to}
              onChange={(e) =>
                setGeneralLedgerFilters((prev) => ({ ...prev, date_to: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="mt-4">
          <AppButton type="button" variant="primary" onClick={() => fetchGeneralLedger()}>
            {loadingGeneralLedger ? 'Loading...' : 'Apply'}
          </AppButton>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard
          label="Opening Balance"
          value={money(generalLedgerData.summary.opening_balance)}
        />
        <SummaryCard label="Total Debit" value={money(generalLedgerData.summary.total_debit)} />
        <SummaryCard label="Total Credit" value={money(generalLedgerData.summary.total_credit)} />
        <SummaryCard
          label="Closing Balance"
          value={money(generalLedgerData.summary.closing_balance)}
        />
      </div>

      <SectionCard
        title={
          generalLedgerData.account
            ? `General Ledger - ${generalLedgerData.account.account_code} ${generalLedgerData.account.account_name}`
            : 'General Ledger'
        }
      >
        <DataTable
          rows={generalLedgerData.items}
          columns={[
            { key: 'entry_date', label: 'Date' },
            { key: 'entry_number', label: 'Entry No.' },
            { key: 'reference_type', label: 'Reference Type' },
            { key: 'reference_id', label: 'Reference ID' },
            { key: 'memo', label: 'Memo' },
            { key: 'description', label: 'Description' },
            { key: 'debit', label: 'Debit', render: (row) => money(row.debit) },
            { key: 'credit', label: 'Credit', render: (row) => money(row.credit) },
            { key: 'running_balance', label: 'Running Balance', render: (row) => money(row.running_balance) },
          ]}
          emptyMessage="No ledger entries found."
        />
      </SectionCard>
    </div>
  );

  const renderBalanceSheet = () => (
    <div className="space-y-4">
      <SectionCard title="Balance Sheet Filter">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">As Of Date</label>
            <input
              type="date"
              className={inputClassName}
              value={balanceSheetFilters.as_of_date}
              onChange={(e) =>
                setBalanceSheetFilters((prev) => ({ ...prev, as_of_date: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="mt-4">
          <AppButton type="button" variant="primary" onClick={() => fetchBalanceSheet()}>
            {loadingBalanceSheet ? 'Loading...' : 'Apply'}
          </AppButton>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <SummaryCard label="Assets" value={money(balanceSheetData.summary.total_assets)} />
        <SummaryCard
          label="Liabilities"
          value={money(balanceSheetData.summary.total_liabilities)}
        />
        <SummaryCard label="Equity" value={money(balanceSheetData.summary.total_equity)} />
        <SummaryCard
          label="L + E"
          value={money(balanceSheetData.summary.total_liabilities_and_equity)}
        />
        <SummaryCard
          label="Difference"
          value={money(balanceSheetData.summary.difference)}
        />
      </div>

      <StatementTable
        title="Assets"
        rows={balanceSheetData.assets}
        totalLabel="Total Assets"
        totalValue={balanceSheetData.summary.total_assets}
      />

      <StatementTable
        title="Liabilities"
        rows={balanceSheetData.liabilities}
        totalLabel="Total Liabilities"
        totalValue={balanceSheetData.summary.total_liabilities}
      />

      <StatementTable
        title="Equity"
        rows={balanceSheetData.equity}
        totalLabel="Total Equity"
        totalValue={balanceSheetData.summary.total_equity}
      />
    </div>
  );

  const renderProfitLoss = () => (
    <div className="space-y-4">
      <SectionCard title="Profit & Loss Filters">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Date From</label>
            <input
              type="date"
              className={inputClassName}
              value={profitLossFilters.date_from}
              onChange={(e) =>
                setProfitLossFilters((prev) => ({ ...prev, date_from: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Date To</label>
            <input
              type="date"
              className={inputClassName}
              value={profitLossFilters.date_to}
              onChange={(e) =>
                setProfitLossFilters((prev) => ({ ...prev, date_to: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="mt-4">
          <AppButton type="button" variant="primary" onClick={() => fetchProfitLoss()}>
            {loadingProfitLoss ? 'Loading...' : 'Apply'}
          </AppButton>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard label="Total Revenue" value={money(profitLossData.summary.total_revenue)} />
        <SummaryCard label="Total Expense" value={money(profitLossData.summary.total_expense)} />
        <SummaryCard label="Net Income" value={money(profitLossData.summary.net_income)} />
      </div>

      <StatementTable
        title="Revenue"
        rows={profitLossData.revenues}
        totalLabel="Total Revenue"
        totalValue={profitLossData.summary.total_revenue}
      />

      <StatementTable
        title="Expenses"
        rows={profitLossData.expenses}
        totalLabel="Total Expense"
        totalValue={profitLossData.summary.total_expense}
      />
    </div>
  );

  const renderArAging = () => (
    <div className="space-y-4">
      <SectionCard title="AR Aging Filters">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Customer</label>
            <select
              className={inputClassName}
              value={arAgingFilters.customer_id}
              onChange={(e) =>
                setArAgingFilters((prev) => ({ ...prev, customer_id: e.target.value }))
              }
            >
              <option value="">All Customers</option>
              {meta.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.customer_code} - {customer.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">As Of Date</label>
            <input
              type="date"
              className={inputClassName}
              value={arAgingFilters.as_of_date}
              onChange={(e) =>
                setArAgingFilters((prev) => ({ ...prev, as_of_date: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="mt-4">
          <AppButton type="button" variant="primary" onClick={() => fetchArAging()}>
            {loadingArAging ? 'Loading...' : 'Apply'}
          </AppButton>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Open AR" value={money(arAgingData.summary.total_balance)} />
        <SummaryCard label="Current" value={money(arAgingData.summary.current)} />
        <SummaryCard label="1 - 30" value={money(arAgingData.summary.bucket_1_30)} />
        <SummaryCard label="31 - 60" value={money(arAgingData.summary.bucket_31_60)} />
        <SummaryCard label="61 - 90" value={money(arAgingData.summary.bucket_61_90)} />
        <SummaryCard label="91+" value={money(arAgingData.summary.bucket_over_90)} />
      </div>

      <SectionCard title="AR Aging by Customer">
        <DataTable
          rows={arAgingData.customers}
          columns={[
            { key: 'customer_name', label: 'Customer' },
            { key: 'total_balance', label: 'Balance', render: (row) => money(row.total_balance) },
            { key: 'current', label: 'Current', render: (row) => money(row.current) },
            { key: 'bucket_1_30', label: '1 - 30', render: (row) => money(row.bucket_1_30) },
            { key: 'bucket_31_60', label: '31 - 60', render: (row) => money(row.bucket_31_60) },
            { key: 'bucket_61_90', label: '61 - 90', render: (row) => money(row.bucket_61_90) },
            { key: 'bucket_over_90', label: '91+', render: (row) => money(row.bucket_over_90) },
          ]}
          emptyMessage="No AR aging records found."
        />
      </SectionCard>
    </div>
  );

  const renderApAging = () => (
    <div className="space-y-4">
      <SectionCard title="AP Aging Filters">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Supplier</label>
            <select
              className={inputClassName}
              value={apAgingFilters.supplier_id}
              onChange={(e) =>
                setApAgingFilters((prev) => ({ ...prev, supplier_id: e.target.value }))
              }
            >
              <option value="">All Suppliers</option>
              {meta.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">As Of Date</label>
            <input
              type="date"
              className={inputClassName}
              value={apAgingFilters.as_of_date}
              onChange={(e) =>
                setApAgingFilters((prev) => ({ ...prev, as_of_date: e.target.value }))
              }
            />
          </div>
        </div>

        <div className="mt-4">
          <AppButton type="button" variant="primary" onClick={() => fetchApAging()}>
            {loadingApAging ? 'Loading...' : 'Apply'}
          </AppButton>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard label="Open AP" value={money(apAgingData.summary.total_balance)} />
        <SummaryCard label="Current" value={money(apAgingData.summary.current)} />
        <SummaryCard label="1 - 30" value={money(apAgingData.summary.bucket_1_30)} />
        <SummaryCard label="31 - 60" value={money(apAgingData.summary.bucket_31_60)} />
        <SummaryCard label="61 - 90" value={money(apAgingData.summary.bucket_61_90)} />
        <SummaryCard label="91+" value={money(apAgingData.summary.bucket_over_90)} />
      </div>

      <SectionCard title="AP Aging by Supplier">
        <DataTable
          rows={apAgingData.suppliers}
          columns={[
            { key: 'supplier_name', label: 'Supplier' },
            { key: 'total_balance', label: 'Balance', render: (row) => money(row.total_balance) },
            { key: 'current', label: 'Current', render: (row) => money(row.current) },
            { key: 'bucket_1_30', label: '1 - 30', render: (row) => money(row.bucket_1_30) },
            { key: 'bucket_31_60', label: '31 - 60', render: (row) => money(row.bucket_31_60) },
            { key: 'bucket_61_90', label: '61 - 90', render: (row) => money(row.bucket_61_90) },
            { key: 'bucket_over_90', label: '91+', render: (row) => money(row.bucket_over_90) },
          ]}
          emptyMessage="No AP aging records found."
        />
      </SectionCard>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Financial Reports"
        subtitle="Review the general ledger, trial balance, statements, and AR/AP aging."
        stats={pageStats}
      />

      <SectionCard title="Report Tabs">
        <div className="flex flex-wrap gap-2">
          {[
            ['trial-balance', 'Trial Balance'],
            ['general-ledger', 'General Ledger'],
            ['balance-sheet', 'Balance Sheet'],
            ['profit-loss', 'Profit & Loss'],
            ['ar-aging', 'AR Aging'],
            ['ap-aging', 'AP Aging'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${tabButtonClass(
                activeTab === key
              )}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </SectionCard>

      {activeTab === 'trial-balance' && renderTrialBalance()}
      {activeTab === 'general-ledger' && renderGeneralLedger()}
      {activeTab === 'balance-sheet' && renderBalanceSheet()}
      {activeTab === 'profit-loss' && renderProfitLoss()}
      {activeTab === 'ar-aging' && renderArAging()}
      {activeTab === 'ap-aging' && renderApAging()}
    </div>
  );
}