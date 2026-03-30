import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import {
  getChartOfAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getGeneralLedger,
  getTrialBalance,
} from '../services/accountingService';

const initialAccountForm = {
  account_code: '',
  account_name: '',
  account_type: 'Asset',
  is_active: 1,
};

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none transition focus:border-[#9b6bff]';

const today = new Date().toISOString().split('T')[0];

const money = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState('coa');

  const [accounts, setAccounts] = useState([]);
  const [accountForm, setAccountForm] = useState(initialAccountForm);
  const [editingAccount, setEditingAccount] = useState(null);
  const [coaFilters, setCoaFilters] = useState({
    search: '',
    account_type: '',
    is_active: '',
  });
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerFilters, setLedgerFilters] = useState({
    date_from: '',
    date_to: '',
    account_id: '',
    reference_type: '',
    status: 'Posted',
    search: '',
  });
  const [loadingLedger, setLoadingLedger] = useState(true);

  const [trialBalance, setTrialBalance] = useState({
    summary: {
      total_accounts: 0,
      total_debit: 0,
      total_credit: 0,
      balanced: true,
    },
    items: [],
  });
  const [trialFilters, setTrialFilters] = useState({
    date_from: '',
    date_to: '',
    account_type: '',
    is_active: '1',
  });
  const [loadingTrialBalance, setLoadingTrialBalance] = useState(true);

  const fetchAccounts = async (params = coaFilters) => {
    try {
      setLoadingAccounts(true);
      const data = await getChartOfAccounts(params);
      setAccounts(data);
    } catch (error) {
      console.error('Fetch chart of accounts failed:', error);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchLedger = async (params = ledgerFilters) => {
    try {
      setLoadingLedger(true);
      const data = await getGeneralLedger(params);
      setLedgerEntries(data);
    } catch (error) {
      console.error('Fetch general ledger failed:', error);
    } finally {
      setLoadingLedger(false);
    }
  };

  const fetchTrialBalance = async (params = trialFilters) => {
    try {
      setLoadingTrialBalance(true);
      const data = await getTrialBalance(params);
      setTrialBalance(data);
    } catch (error) {
      console.error('Fetch trial balance failed:', error);
    } finally {
      setLoadingTrialBalance(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchLedger();
    fetchTrialBalance();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchAccounts(coaFilters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [coaFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchLedger(ledgerFilters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [ledgerFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchTrialBalance(trialFilters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [trialFilters]);

  const resetAccountForm = () => {
    setAccountForm(initialAccountForm);
    setEditingAccount(null);
  };

  const handleAccountFormChange = (e) => {
    const { name, value } = e.target;
    setAccountForm((prev) => ({
      ...prev,
      [name]: name === 'is_active' ? Number(value) : value,
    }));
  };

  const handleSaveAccount = async (e) => {
    e.preventDefault();

    try {
      if (editingAccount) {
        const updated = await updateAccount(editingAccount.id, accountForm);
        setAccounts((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
      } else {
        const created = await createAccount(accountForm);
        setAccounts((prev) => [created, ...prev]);
      }

      resetAccountForm();
      fetchAccounts();
      fetchTrialBalance();
    } catch (error) {
      console.error('Save account failed:', error);
      alert(error?.response?.data?.message || 'Failed to save account');
    }
  };

  const handleEditAccount = (account) => {
    setEditingAccount(account);
    setAccountForm({
      account_code: account.account_code || '',
      account_name: account.account_name || '',
      account_type: account.account_type || 'Asset',
      is_active: Number(account.is_active) ? 1 : 0,
    });
    setActiveTab('coa');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteAccount = async (id) => {
    const confirmed = window.confirm(
      'Delete this account? Accounts with journal history cannot be deleted.'
    );
    if (!confirmed) return;

    try {
      await deleteAccount(id);
      setAccounts((prev) => prev.filter((item) => item.id !== id));

      if (editingAccount?.id === id) {
        resetAccountForm();
      }

      fetchAccounts();
      fetchTrialBalance();
    } catch (error) {
      console.error('Delete account failed:', error);
      alert(error?.response?.data?.message || 'Failed to delete account');
    }
  };

  const ledgerSummary = useMemo(() => {
    return {
      totalEntries: ledgerEntries.length,
      totalDebit: ledgerEntries.reduce(
        (sum, entry) => sum + Number(entry.total_debit || 0),
        0
      ),
      totalCredit: ledgerEntries.reduce(
        (sum, entry) => sum + Number(entry.total_credit || 0),
        0
      ),
    };
  }, [ledgerEntries]);

  const headerStats = useMemo(() => {
    return [
      { label: 'Accounts', value: accounts.length },
      { label: 'Ledger Entries', value: ledgerEntries.length },
      {
        label: 'TB Balanced',
        value: trialBalance.summary.balanced ? 'Yes' : 'No',
        variant: trialBalance.summary.balanced ? undefined : 'danger',
      },
    ];
  }, [accounts.length, ledgerEntries.length, trialBalance.summary.balanced]);

  const getAccountTypeBadgeClass = (type) => {
    if (type === 'Asset') return 'bg-blue-100 text-blue-700';
    if (type === 'Liability') return 'bg-amber-100 text-amber-700';
    if (type === 'Equity') return 'bg-violet-100 text-violet-700';
    if (type === 'Revenue') return 'bg-emerald-100 text-emerald-700';
    return 'bg-rose-100 text-rose-700';
  };

  const getStatusBadgeClass = (isActive) => {
    return Number(isActive)
      ? 'bg-green-100 text-green-700'
      : 'bg-slate-200 text-slate-700';
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Accounting"
        subtitle="Maintain chart of accounts, review journal postings, and validate your trial balance."
        stats={headerStats}
        actions={
          <div className="flex flex-wrap gap-2">
            <AppButton
              type="button"
              variant={activeTab === 'coa' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('coa')}
            >
              Chart of Accounts
            </AppButton>
            <AppButton
              type="button"
              variant={activeTab === 'gl' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('gl')}
            >
              General Ledger
            </AppButton>
            <AppButton
              type="button"
              variant={activeTab === 'tb' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('tb')}
            >
              Trial Balance
            </AppButton>
          </div>
        }
      />

      {activeTab === 'coa' && (
        <>
          <SectionCard
            title={editingAccount ? 'Edit Account' : 'Add Account'}
            subtitle="Create and manage your chart of accounts."
            action={
              editingAccount ? (
                <AppButton type="button" variant="secondary" onClick={resetAccountForm}>
                  Cancel
                </AppButton>
              ) : null
            }
          >
            <form onSubmit={handleSaveAccount} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <input
                  type="text"
                  name="account_code"
                  placeholder="Account Code"
                  value={accountForm.account_code}
                  onChange={handleAccountFormChange}
                  className={inputClassName}
                  required
                />

                <input
                  type="text"
                  name="account_name"
                  placeholder="Account Name"
                  value={accountForm.account_name}
                  onChange={handleAccountFormChange}
                  className={inputClassName}
                  required
                />

                <select
                  name="account_type"
                  value={accountForm.account_type}
                  onChange={handleAccountFormChange}
                  className={inputClassName}
                >
                  <option value="Asset">Asset</option>
                  <option value="Liability">Liability</option>
                  <option value="Equity">Equity</option>
                  <option value="Revenue">Revenue</option>
                  <option value="Expense">Expense</option>
                </select>

                <select
                  name="is_active"
                  value={accountForm.is_active}
                  onChange={handleAccountFormChange}
                  className={inputClassName}
                >
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <AppButton type="submit">
                  {editingAccount ? 'Update Account' : 'Save Account'}
                </AppButton>

                {editingAccount && (
                  <AppButton type="button" variant="secondary" onClick={resetAccountForm}>
                    Cancel Edit
                  </AppButton>
                )}
              </div>
            </form>
          </SectionCard>

          <SectionCard
            title="Chart of Accounts"
            subtitle="Search, filter, and maintain ledger accounts."
            action={
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCoaFilters({
                    search: '',
                    account_type: '',
                    is_active: '',
                  })
                }
              >
                Clear Filters
              </AppButton>
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <input
                  type="text"
                  placeholder="Search code or account name"
                  value={coaFilters.search}
                  onChange={(e) =>
                    setCoaFilters((prev) => ({ ...prev, search: e.target.value }))
                  }
                  className={inputClassName}
                />

                <select
                  value={coaFilters.account_type}
                  onChange={(e) =>
                    setCoaFilters((prev) => ({ ...prev, account_type: e.target.value }))
                  }
                  className={inputClassName}
                >
                  <option value="">All Types</option>
                  <option value="Asset">Asset</option>
                  <option value="Liability">Liability</option>
                  <option value="Equity">Equity</option>
                  <option value="Revenue">Revenue</option>
                  <option value="Expense">Expense</option>
                </select>

                <select
                  value={coaFilters.is_active}
                  onChange={(e) =>
                    setCoaFilters((prev) => ({ ...prev, is_active: e.target.value }))
                  }
                  className={inputClassName}
                >
                  <option value="">All Status</option>
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>

                <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-sm text-[#6e6487]">
                  Total Accounts: <span className="font-semibold text-[#4d3188]">{accounts.length}</span>
                </div>
              </div>

              {loadingAccounts ? (
                <div className="rounded-2xl bg-[#fcfaff] p-6 text-sm text-[#7c7494]">
                  Loading accounts...
                </div>
              ) : accounts.length === 0 ? (
                <EmptyState message="No accounts found." />
              ) : (
                <>
                  <div className="hidden xl:block">
                    <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
                      <table className="min-w-full text-center">
                        <thead className="bg-[#f7f2ff]">
                          <tr className="text-[#4d3188]">
                            <th className="px-6 py-4 text-center">Code</th>
                            <th className="px-6 py-4 text-center">Account Name</th>
                            <th className="px-6 py-4 text-center">Type</th>
                            <th className="px-6 py-4 text-center">Status</th>
                            <th className="px-6 py-4 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accounts.map((account) => (
                            <tr
                              key={account.id}
                              className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]"
                            >
                              <td className="px-6 py-4 font-semibold">{account.account_code}</td>
                              <td className="px-6 py-4">{account.account_name}</td>
                              <td className="px-6 py-4">
                                <div className="flex justify-center">
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getAccountTypeBadgeClass(
                                      account.account_type
                                    )}`}
                                  >
                                    {account.account_type}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex justify-center">
                                  <span
                                    className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getStatusBadgeClass(
                                      account.is_active
                                    )}`}
                                  >
                                    {Number(account.is_active) ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center justify-center gap-2">
                                  <AppButton
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditAccount(account)}
                                  >
                                    Edit
                                  </AppButton>
                                  <AppButton
                                    type="button"
                                    variant="danger"
                                    size="sm"
                                    onClick={() => handleDeleteAccount(account.id)}
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
                  </div>

                  <div className="grid grid-cols-1 gap-4 xl:hidden">
                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm sm:rounded-3xl"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="font-bold text-[#4d3188]">
                              {account.account_code} - {account.account_name}
                            </h3>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getAccountTypeBadgeClass(
                                  account.account_type
                                )}`}
                              >
                                {account.account_type}
                              </span>
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClass(
                                  account.is_active
                                )}`}
                              >
                                {Number(account.is_active) ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <AppButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditAccount(account)}
                            >
                              Edit
                            </AppButton>
                            <AppButton
                              type="button"
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeleteAccount(account.id)}
                            >
                              Delete
                            </AppButton>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </SectionCard>
        </>
      )}

      {activeTab === 'gl' && (
        <>
          <SectionCard
            title="General Ledger Filters"
            subtitle="Filter posted journals by date, account, reference type, and keyword."
            action={
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setLedgerFilters({
                    date_from: '',
                    date_to: '',
                    account_id: '',
                    reference_type: '',
                    status: 'Posted',
                    search: '',
                  })
                }
              >
                Clear Filters
              </AppButton>
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  From
                </label>
                <input
                  type="date"
                  value={ledgerFilters.date_from}
                  onChange={(e) =>
                    setLedgerFilters((prev) => ({ ...prev, date_from: e.target.value }))
                  }
                  className={inputClassName}
                  max={today}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  To
                </label>
                <input
                  type="date"
                  value={ledgerFilters.date_to}
                  onChange={(e) =>
                    setLedgerFilters((prev) => ({ ...prev, date_to: e.target.value }))
                  }
                  className={inputClassName}
                  max={today}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Account
                </label>
                <select
                  value={ledgerFilters.account_id}
                  onChange={(e) =>
                    setLedgerFilters((prev) => ({ ...prev, account_id: e.target.value }))
                  }
                  className={inputClassName}
                >
                  <option value="">All Accounts</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.account_code} - {account.account_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Reference
                </label>
                <select
                  value={ledgerFilters.reference_type}
                  onChange={(e) =>
                    setLedgerFilters((prev) => ({
                      ...prev,
                      reference_type: e.target.value,
                    }))
                  }
                  className={inputClassName}
                >
                  <option value="">All References</option>
                  <option value="AP Invoice">AP Invoice</option>
                  <option value="AP Payment">AP Payment</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Status
                </label>
                <select
                  value={ledgerFilters.status}
                  onChange={(e) =>
                    setLedgerFilters((prev) => ({ ...prev, status: e.target.value }))
                  }
                  className={inputClassName}
                >
                  <option value="">All Status</option>
                  <option value="Posted">Posted</option>
                  <option value="Draft">Draft</option>
                  <option value="Voided">Voided</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Search
                </label>
                <input
                  type="text"
                  placeholder="Entry no, memo, reference"
                  value={ledgerFilters.search}
                  onChange={(e) =>
                    setLedgerFilters((prev) => ({ ...prev, search: e.target.value }))
                  }
                  className={inputClassName}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="General Ledger"
            subtitle="Review journal headers and their debit/credit lines."
          >
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">Entries</p>
                <p className="mt-1 text-xl font-bold text-[#4d3188]">
                  {ledgerSummary.totalEntries}
                </p>
              </div>
              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">Total Debit</p>
                <p className="mt-1 text-xl font-bold text-[#4d3188]">
                  {money(ledgerSummary.totalDebit)}
                </p>
              </div>
              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">Total Credit</p>
                <p className="mt-1 text-xl font-bold text-[#4d3188]">
                  {money(ledgerSummary.totalCredit)}
                </p>
              </div>
            </div>

            {loadingLedger ? (
              <div className="rounded-2xl bg-[#fcfaff] p-6 text-sm text-[#7c7494]">
                Loading general ledger...
              </div>
            ) : ledgerEntries.length === 0 ? (
              <EmptyState message="No journal entries found." />
            ) : (
              <div className="space-y-4">
                {ledgerEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="overflow-hidden rounded-3xl border border-[#ebe4f7] bg-white shadow-sm"
                  >
                    <div className="border-b border-[#ebe4f7] bg-[#faf7ff] px-4 py-4 sm:px-6">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-[#4d3188]">
                            {entry.entry_number}
                          </h3>
                          <p className="mt-1 text-sm text-[#7c7494]">
                            Date: {entry.entry_date} | Reference: {entry.reference_type || '-'}{' '}
                            {entry.reference_id ? `#${entry.reference_id}` : ''}
                          </p>
                          <p className="mt-1 text-sm text-[#6e6487]">
                            Memo: {entry.memo || '-'}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
                          <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                            <p className="text-xs text-[#7c7494]">Status</p>
                            <p className="text-sm font-bold text-[#4d3188]">{entry.status}</p>
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                            <p className="text-xs text-[#7c7494]">Debit</p>
                            <p className="text-sm font-bold text-[#4d3188]">
                              {money(entry.total_debit)}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3 text-center shadow-sm">
                            <p className="text-xs text-[#7c7494]">Credit</p>
                            <p className="text-sm font-bold text-[#4d3188]">
                              {money(entry.total_credit)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-center">
                        <thead className="bg-[#f7f2ff]">
                          <tr className="text-[#4d3188]">
                            <th className="px-6 py-4 text-center">Account Code</th>
                            <th className="px-6 py-4 text-center">Account Name</th>
                            <th className="px-6 py-4 text-center">Description</th>
                            <th className="px-6 py-4 text-center">Debit</th>
                            <th className="px-6 py-4 text-center">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.lines.map((line) => (
                            <tr
                              key={line.id}
                              className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]"
                            >
                              <td className="px-6 py-4 font-medium">{line.account_code}</td>
                              <td className="px-6 py-4">{line.account_name}</td>
                              <td className="px-6 py-4">{line.description || '-'}</td>
                              <td className="px-6 py-4">{money(line.debit)}</td>
                              <td className="px-6 py-4">{money(line.credit)}</td>
                            </tr>
                          ))}

                          <tr className="border-t border-[#d9d0ec] bg-[#fcfaff] font-semibold text-[#4d3188]">
                            <td className="px-6 py-4" colSpan="3">
                              Entry Total
                            </td>
                            <td className="px-6 py-4">{money(entry.total_debit)}</td>
                            <td className="px-6 py-4">{money(entry.total_credit)}</td>
                          </tr>
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

      {activeTab === 'tb' && (
        <>
          <SectionCard
            title="Trial Balance Filters"
            subtitle="Filter balances by period, account type, and account status."
            action={
              <AppButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setTrialFilters({
                    date_from: '',
                    date_to: '',
                    account_type: '',
                    is_active: '1',
                  })
                }
              >
                Clear Filters
              </AppButton>
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  From
                </label>
                <input
                  type="date"
                  value={trialFilters.date_from}
                  onChange={(e) =>
                    setTrialFilters((prev) => ({ ...prev, date_from: e.target.value }))
                  }
                  className={inputClassName}
                  max={today}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  To
                </label>
                <input
                  type="date"
                  value={trialFilters.date_to}
                  onChange={(e) =>
                    setTrialFilters((prev) => ({ ...prev, date_to: e.target.value }))
                  }
                  className={inputClassName}
                  max={today}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Account Type
                </label>
                <select
                  value={trialFilters.account_type}
                  onChange={(e) =>
                    setTrialFilters((prev) => ({ ...prev, account_type: e.target.value }))
                  }
                  className={inputClassName}
                >
                  <option value="">All Types</option>
                  <option value="Asset">Asset</option>
                  <option value="Liability">Liability</option>
                  <option value="Equity">Equity</option>
                  <option value="Revenue">Revenue</option>
                  <option value="Expense">Expense</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Account Status
                </label>
                <select
                  value={trialFilters.is_active}
                  onChange={(e) =>
                    setTrialFilters((prev) => ({ ...prev, is_active: e.target.value }))
                  }
                  className={inputClassName}
                >
                  <option value="">All Status</option>
                  <option value="1">Active Only</option>
                  <option value="0">Inactive Only</option>
                </select>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Trial Balance"
            subtitle="Validate debit and credit equality across your ledger accounts."
          >
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">Accounts</p>
                <p className="mt-1 text-xl font-bold text-[#4d3188]">
                  {trialBalance.summary.total_accounts}
                </p>
              </div>

              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">Total Debit</p>
                <p className="mt-1 text-xl font-bold text-[#4d3188]">
                  {money(trialBalance.summary.total_debit)}
                </p>
              </div>

              <div className="rounded-2xl bg-[#f8f5ff] px-4 py-3 text-center">
                <p className="text-sm text-[#7c7494]">Total Credit</p>
                <p className="mt-1 text-xl font-bold text-[#4d3188]">
                  {money(trialBalance.summary.total_credit)}
                </p>
              </div>

              <div
                className={`rounded-2xl px-4 py-3 text-center ${
                  trialBalance.summary.balanced
                    ? 'bg-green-100 text-green-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                <p className="text-sm">Balanced</p>
                <p className="mt-1 text-xl font-bold">
                  {trialBalance.summary.balanced ? 'Yes' : 'No'}
                </p>
              </div>
            </div>

            {loadingTrialBalance ? (
              <div className="rounded-2xl bg-[#fcfaff] p-6 text-sm text-[#7c7494]">
                Loading trial balance...
              </div>
            ) : trialBalance.items.length === 0 ? (
              <EmptyState message="No trial balance rows found." />
            ) : (
              <>
                <div className="hidden xl:block">
                  <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
                    <table className="min-w-full text-center">
                      <thead className="bg-[#f7f2ff]">
                        <tr className="text-[#4d3188]">
                          <th className="px-6 py-4 text-center">Code</th>
                          <th className="px-6 py-4 text-center">Account Name</th>
                          <th className="px-6 py-4 text-center">Type</th>
                          <th className="px-6 py-4 text-center">Debit</th>
                          <th className="px-6 py-4 text-center">Credit</th>
                          <th className="px-6 py-4 text-center">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialBalance.items.map((item) => (
                          <tr
                            key={item.id}
                            className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]"
                          >
                            <td className="px-6 py-4 font-semibold">{item.account_code}</td>
                            <td className="px-6 py-4">{item.account_name}</td>
                            <td className="px-6 py-4">
                              <div className="flex justify-center">
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getAccountTypeBadgeClass(
                                    item.account_type
                                  )}`}
                                >
                                  {item.account_type}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">{money(item.total_debit)}</td>
                            <td className="px-6 py-4">{money(item.total_credit)}</td>
                            <td className="px-6 py-4 font-semibold">
                              {money(item.balance)}
                            </td>
                          </tr>
                        ))}

                        <tr className="border-t border-[#d9d0ec] bg-[#fcfaff] font-semibold text-[#4d3188]">
                          <td className="px-6 py-4" colSpan="3">
                            Totals
                          </td>
                          <td className="px-6 py-4">{money(trialBalance.summary.total_debit)}</td>
                          <td className="px-6 py-4">{money(trialBalance.summary.total_credit)}</td>
                          <td className="px-6 py-4">
                            {trialBalance.summary.balanced ? 'Balanced' : 'Check Entries'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:hidden">
                  {trialBalance.items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm sm:rounded-3xl"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-bold text-[#4d3188]">
                            {item.account_code} - {item.account_name}
                          </h3>
                          <div className="mt-2">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getAccountTypeBadgeClass(
                                item.account_type
                              )}`}
                            >
                              {item.account_type}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <div className="rounded-2xl bg-[#f8f5ff] px-3 py-3 text-center">
                          <p className="text-xs text-[#7c7494]">Debit</p>
                          <p className="mt-1 text-sm font-bold text-[#4d3188]">
                            {money(item.total_debit)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#f8f5ff] px-3 py-3 text-center">
                          <p className="text-xs text-[#7c7494]">Credit</p>
                          <p className="mt-1 text-sm font-bold text-[#4d3188]">
                            {money(item.total_credit)}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#f8f5ff] px-3 py-3 text-center">
                          <p className="text-xs text-[#7c7494]">Balance</p>
                          <p className="mt-1 text-sm font-bold text-[#4d3188]">
                            {money(item.balance)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}