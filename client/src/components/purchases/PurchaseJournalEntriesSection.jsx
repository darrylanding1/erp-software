import { useEffect, useState } from 'react';
import SectionCard from '../common/SectionCard';
import EmptyState from '../common/EmptyState';
import AppButton from '../common/AppButton';
import { getPurchaseJournalEntries } from '../../services/purchaseService';

export default function PurchaseJournalEntriesSection() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const data = await getPurchaseJournalEntries();
      setEntries(data || []);
    } catch (error) {
      console.error('Fetch purchase journal entries failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const typeClasses = (type) => {
    if (type === 'AP Payment') return 'bg-emerald-100 text-emerald-700';
    return 'bg-violet-100 text-violet-700';
  };

  return (
    <SectionCard
      title="Journal Entries"
      subtitle="Automatic journal entries posted from AP invoice and AP payment transactions."
      action={
        <AppButton type="button" variant="ghost" size="sm" onClick={fetchEntries}>
          Refresh
        </AppButton>
      }
    >
      {loading ? (
        <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
          Loading journal entries...
        </div>
      ) : entries.length === 0 ? (
        <EmptyState message="No journal entries found." />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold text-[#4d3188]">
                      {entry.entry_number}
                    </h3>
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${typeClasses(
                        entry.reference_type
                      )}`}
                    >
                      {entry.reference_type}
                    </span>
                  </div>

                  <p className="text-sm text-[#7c7494]">
                    Entry Date: {new Date(entry.entry_date).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-[#7c7494]">
                    Memo: {entry.memo || '-'}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#f7f2ff] px-4 py-3 text-sm font-semibold text-[#4d3188]">
                  Total: ₱
                  {Number(entry.total_debit || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-[#f1ebfb]">
                <table className="min-w-full">
                  <thead className="bg-[#f7f2ff]">
                    <tr className="text-left text-[#4d3188]">
                      <th className="px-4 py-3">Account Code</th>
                      <th className="px-4 py-3">Account Name</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Debit</th>
                      <th className="px-4 py-3">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map((line) => (
                      <tr key={line.id} className="border-t border-[#ebe4f7]">
                        <td className="px-4 py-3 font-medium text-[#2b2340]">
                          {line.account_code}
                        </td>
                        <td className="px-4 py-3">{line.account_name}</td>
                        <td className="px-4 py-3">{line.description || '-'}</td>
                        <td className="px-4 py-3">
                          {Number(line.debit || 0) > 0
                            ? `₱${Number(line.debit).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {Number(line.credit || 0) > 0
                            ? `₱${Number(line.credit).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            : '-'}
                        </td>
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
  );
}