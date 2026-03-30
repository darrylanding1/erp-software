import { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import EmptyState from '../components/common/EmptyState';
import { getAuditTrails } from '../services/auditTrailService';

export default function AuditTrailPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    action: '',
    module_name: '',
  });

  const fetchRecords = async (customFilters = filters) => {
    try {
      setLoading(true);
      const data = await getAuditTrails(customFilters);
      setRecords(data);
    } catch (error) {
      console.error('Fetch audit trails failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRecords(filters);
    }, 300);

    return () => clearTimeout(timer);
  }, [filters]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        subtitle="Review login activity and critical create, update, and delete actions."
        stats={[
          { label: 'Logs', value: records.length },
          { label: 'Latest Action', value: records[0]?.action || '-' },
        ]}
      />

      <SectionCard title="Audit Logs" subtitle="Track changes across secured modules.">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="text"
              placeholder="Search description, user, or module"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />
            <input
              type="text"
              placeholder="Filter action"
              value={filters.action}
              onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />
            <input
              type="text"
              placeholder="Filter module"
              value={filters.module_name}
              onChange={(e) => setFilters((prev) => ({ ...prev, module_name: e.target.value }))}
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />
          </div>

          {loading ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading audit logs...
            </div>
          ) : records.length === 0 ? (
            <EmptyState message="No audit logs found." />
          ) : (
            <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
              <table className="min-w-full">
                <thead className="bg-[#f7f2ff] text-left text-[#4d3188]">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">User</th>
                    <th className="px-6 py-4">Action</th>
                    <th className="px-6 py-4">Module</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr
                      key={record.id}
                      className="border-t border-[#f1ebfb] text-sm text-[#5f547c]"
                    >
                      <td className="px-6 py-4">
                        {new Date(record.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-[#4d3188]">
                          {record.user_name || 'System'}
                        </div>
                        <div className="text-xs text-[#8b81a6]">
                          {record.user_email || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4">{record.action}</td>
                      <td className="px-6 py-4">{record.module_name}</td>
                      <td className="px-6 py-4">{record.description}</td>
                      <td className="px-6 py-4">{record.ip_address || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}