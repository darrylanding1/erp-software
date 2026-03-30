import { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import {
  getAccountingPeriods,
  generateAccountingPeriods,
  getPostingLockStatus,
  softCloseAccountingPeriod,
  hardCloseAccountingPeriod,
  reopenAccountingPeriod,
} from '../services/accountingPeriodService';

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] bg-white px-4 py-3 outline-none transition focus:border-[#9b6bff]';

const today = new Date().toISOString().split('T')[0];

const statusBadgeClass = {
  Open: 'bg-emerald-100 text-emerald-700',
  'Soft Closed': 'bg-amber-100 text-amber-700',
  'Hard Closed': 'bg-rose-100 text-rose-700',
};

export default function AccountingPeriodsPage() {
  const [filters, setFilters] = useState({
    year: new Date().getFullYear().toString(),
    status: '',
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [generator, setGenerator] = useState({
    start_year: new Date().getFullYear(),
    start_month: 1,
    months: 12,
  });

  const [postingCheckDate, setPostingCheckDate] = useState(today);
  const [postingCheckResult, setPostingCheckResult] = useState(null);

  const loadPeriods = async () => {
    try {
      setLoading(true);
      const data = await getAccountingPeriods(filters);
      setItems(data.items || []);
    } catch (error) {
      console.error('Load accounting periods error:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPeriods();
  }, []);

  const handleGenerate = async () => {
    try {
      await generateAccountingPeriods(generator);
      await loadPeriods();
      alert('Accounting periods generated successfully.');
    } catch (error) {
      console.error('Generate accounting periods error:', error);
      alert(error?.response?.data?.message || 'Failed to generate accounting periods.');
    }
  };

  const handleSoftClose = async (item) => {
    try {
      await softCloseAccountingPeriod(item.id, {
        close_notes: `Soft-closed ${item.period_code}`,
      });
      await loadPeriods();
    } catch (error) {
      console.error('Soft close error:', error);
      alert(error?.response?.data?.message || 'Failed to soft-close period.');
    }
  };

  const handleHardClose = async (item) => {
    try {
      await hardCloseAccountingPeriod(item.id, {
        close_notes: `Hard-closed ${item.period_code}`,
      });
      await loadPeriods();
    } catch (error) {
      console.error('Hard close error:', error);
      alert(error?.response?.data?.message || 'Failed to hard-close period.');
    }
  };

  const handleReopen = async (item) => {
    try {
      await reopenAccountingPeriod(item.id, {
        close_notes: `Reopened ${item.period_code}`,
      });
      await loadPeriods();
    } catch (error) {
      console.error('Reopen error:', error);
      alert(error?.response?.data?.message || 'Failed to reopen period.');
    }
  };

  const handlePostingCheck = async () => {
    try {
      const data = await getPostingLockStatus({ posting_date: postingCheckDate });
      setPostingCheckResult(data);
    } catch (error) {
      setPostingCheckResult(error?.response?.data || null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Accounting Periods"
        subtitle="Manage open, soft-closed, and hard-closed posting periods."
        stats={[
          { label: 'Open', value: items.filter((x) => x.status === 'Open').length },
          { label: 'Soft Closed', value: items.filter((x) => x.status === 'Soft Closed').length },
          { label: 'Hard Closed', value: items.filter((x) => x.status === 'Hard Closed').length },
        ]}
      />

      <SectionCard title="Generate Periods">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">
              Start Year
            </label>
            <input
              type="number"
              className={inputClassName}
              value={generator.start_year}
              onChange={(e) =>
                setGenerator((prev) => ({
                  ...prev,
                  start_year: Number(e.target.value),
                }))
              }
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">
              Start Month
            </label>
            <input
              type="number"
              min="1"
              max="12"
              className={inputClassName}
              value={generator.start_month}
              onChange={(e) =>
                setGenerator((prev) => ({
                  ...prev,
                  start_month: Number(e.target.value),
                }))
              }
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">
              Number of Months
            </label>
            <input
              type="number"
              min="1"
              className={inputClassName}
              value={generator.months}
              onChange={(e) =>
                setGenerator((prev) => ({
                  ...prev,
                  months: Number(e.target.value),
                }))
              }
            />
          </div>
        </div>

        <div className="mt-4">
          <AppButton type="button" variant="primary" onClick={handleGenerate}>
            Generate Periods
          </AppButton>
        </div>
      </SectionCard>

      <SectionCard title="Posting Lock Check">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">
              Posting Date
            </label>
            <input
              type="date"
              className={inputClassName}
              value={postingCheckDate}
              onChange={(e) => setPostingCheckDate(e.target.value)}
            />
          </div>

          <div className="flex items-end">
            <AppButton type="button" variant="secondary" onClick={handlePostingCheck}>
              Check Posting Lock
            </AppButton>
          </div>
        </div>

        {postingCheckResult && (
          <div className="mt-4 rounded-3xl border border-[#ebe4f7] bg-[#faf7ff] p-4">
            <p className="font-semibold text-[#4d3188]">
              {postingCheckResult.message || 'No message'}
            </p>
            {postingCheckResult.period && (
              <p className="mt-2 text-sm text-[#6e6487]">
                Period: {postingCheckResult.period.period_code} | Status:{' '}
                {postingCheckResult.period.status}
              </p>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Period Filters">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Year</label>
            <input
              type="number"
              className={inputClassName}
              value={filters.year}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, year: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#6e6487]">Status</label>
            <select
              className={inputClassName}
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
            >
              <option value="">All</option>
              <option value="Open">Open</option>
              <option value="Soft Closed">Soft Closed</option>
              <option value="Hard Closed">Hard Closed</option>
            </select>
          </div>

          <div className="flex items-end">
            <AppButton type="button" variant="primary" onClick={loadPeriods}>
              Apply Filters
            </AppButton>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Accounting Period List">
        {loading ? (
          <div className="rounded-3xl border border-[#ebe4f7] bg-white p-6 text-center text-[#6e6487]">
            Loading periods...
          </div>
        ) : items.length === 0 ? (
          <EmptyState message="No accounting periods found." />
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
            <table className="min-w-full text-center">
              <thead className="bg-[#f7f2ff]">
                <tr className="text-[#4d3188]">
                  <th className="px-4 py-4 text-sm font-semibold">Period</th>
                  <th className="px-4 py-4 text-sm font-semibold">Start Date</th>
                  <th className="px-4 py-4 text-sm font-semibold">End Date</th>
                  <th className="px-4 py-4 text-sm font-semibold">Status</th>
                  <th className="px-4 py-4 text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]"
                  >
                    <td className="px-4 py-4 text-sm font-medium text-[#2b2340]">
                      {item.period_code}
                    </td>
                    <td className="px-4 py-4 text-sm text-[#2b2340]">{item.start_date}</td>
                    <td className="px-4 py-4 text-sm text-[#2b2340]">{item.end_date}</td>
                    <td className="px-4 py-4 text-sm">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          statusBadgeClass[item.status] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap justify-center gap-2">
                        <AppButton
                          type="button"
                          variant="secondary"
                          onClick={() => handleSoftClose(item)}
                        >
                          Soft Close
                        </AppButton>
                        <AppButton
                          type="button"
                          variant="danger"
                          onClick={() => handleHardClose(item)}
                        >
                          Hard Close
                        </AppButton>
                        <AppButton
                          type="button"
                          variant="ghost"
                          onClick={() => handleReopen(item)}
                        >
                          Reopen
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
    </div>
  );
}