import { useEffect, useState } from 'react';
import { getLowStockReport } from '../services/reportService';

export default function ReportsPage() {
  const [threshold, setThreshold] = useState(10);
  const [report, setReport] = useState({
    summary: {
      totalItems: 0,
      totalUnits: 0,
      totalStockValue: 0,
    },
    items: [],
  });
  const [loading, setLoading] = useState(true);

  const fetchReport = async (customThreshold = threshold) => {
    try {
      setLoading(true);
      const data = await getLowStockReport(customThreshold);
      setReport(data);
    } catch (error) {
      console.error('Fetch low stock report failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const handleApply = () => {
    fetchReport(threshold);
  };

  const getSummarySeverityClasses = (totalItems) => {
    if (totalItems >= 10) {
      return 'bg-red-100 text-red-700 border border-red-200';
    }

    if (totalItems >= 5) {
      return 'bg-amber-100 text-amber-700 border border-amber-200';
    }

    if (totalItems >= 1) {
      return 'bg-yellow-100 text-yellow-700 border border-yellow-200';
    }

    return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
  };

  const getItemStatusClasses = (quantity) => {
    if (quantity <= 3) {
      return 'bg-red-100 text-red-700';
    }

    if (quantity <= 7) {
      return 'bg-amber-100 text-amber-700';
    }

    return 'bg-yellow-100 text-yellow-700';
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <section className="rounded-2xl bg-gradient-to-r from-[#efe4ff] to-[#fff9e8] p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#4d3188] sm:text-2xl lg:text-3xl">
              Reports
            </h1>
            <p className="mt-1 text-sm text-[#6e6487] sm:mt-2 sm:text-base">
              Review low stock items and inventory risk.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div
              className={`rounded-2xl px-4 py-3 text-center shadow-sm ${getSummarySeverityClasses(
                report.summary.totalItems
              )}`}
            >
              <p className="text-xs sm:text-sm">Low Stock Items</p>
              <p className="mt-1 text-lg font-bold sm:text-xl">
                {report.summary.totalItems}
              </p>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-3 text-center shadow-sm">
              <p className="text-xs text-[#7c7494] sm:text-sm">Total Units</p>
              <p className="mt-1 text-lg font-bold text-[#4d3188] sm:text-xl">
                {report.summary.totalUnits}
              </p>
            </div>

            <div className="rounded-2xl bg-white/80 px-4 py-3 text-center shadow-sm">
              <p className="text-xs text-[#7c7494] sm:text-sm">Stock Value</p>
              <p className="mt-1 text-lg font-bold text-[#4d3188] sm:text-xl">
                ₱{Number(report.summary.totalStockValue || 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#4d3188]">
              Low Stock Report
            </h2>
            <p className="mt-1 text-sm text-[#7c7494]">
              Show products with quantity less than or equal to your threshold.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                Threshold
              </label>
              <input
                type="number"
                min="1"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff] sm:w-36"
              />
            </div>

            <button
              onClick={handleApply}
              className="rounded-2xl bg-[#9b6bff] px-5 py-3 font-semibold text-white hover:bg-[#8756f0]"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#ebe4f7] bg-white p-5 text-sm shadow-sm sm:rounded-3xl sm:p-6">
          Loading report...
        </div>
      ) : (
        <>
          <div className="hidden xl:block">
            <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm">
              <table className="min-w-full text-center">
                <thead className="bg-[#f7f2ff]">
                  <tr className="text-[#4d3188]">
                    <th className="px-6 py-4 text-center">Product</th>
                    <th className="px-6 py-4 text-center">SKU</th>
                    <th className="px-6 py-4 text-center">Category</th>
                    <th className="px-6 py-4 text-center">Quantity</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-center">Base Price</th>
                    <th className="px-6 py-4 text-center">Stock Value</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((item) => (
                    <tr key={item.id} className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]">
                      <td className="px-6 py-4 font-medium">{item.name}</td>
                      <td className="px-6 py-4">{item.sku}</td>
                      <td className="px-6 py-4">{item.category_name || '-'}</td>
                      <td className="px-6 py-4">{item.quantity}</td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getItemStatusClasses(
                              item.quantity
                            )}`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        ₱{Number(item.base_price).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        ₱{Number(item.stock_value).toLocaleString()}
                      </td>
                    </tr>
                  ))}

                  {report.items.length === 0 && (
                    <tr>
                      <td colSpan="7" className="px-6 py-8 text-center text-[#7c7494]">
                        No low stock items found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:hidden">
            {report.items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm sm:rounded-3xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-[#4d3188]">{item.name}</h3>
                    <p className="text-sm text-[#7c7494]">SKU: {item.sku}</p>
                  </div>

                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getItemStatusClasses(
                      item.quantity
                    )}`}
                  >
                    {item.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                  <div className="rounded-xl bg-[#fcfaff] p-3">
                    <p className="text-[#7c7494]">Category</p>
                    <p className="font-semibold text-[#2b2340]">
                      {item.category_name || '-'}
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#fcfaff] p-3">
                    <p className="text-[#7c7494]">Quantity</p>
                    <p className="font-semibold text-[#2b2340]">{item.quantity}</p>
                  </div>

                  <div className="rounded-xl bg-[#fcfaff] p-3">
                    <p className="text-[#7c7494]">Base Price</p>
                    <p className="font-semibold text-[#2b2340]">
                      ₱{Number(item.base_price).toLocaleString()}
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#fcfaff] p-3">
                    <p className="text-[#7c7494]">Stock Value</p>
                    <p className="font-semibold text-[#2b2340]">
                      ₱{Number(item.stock_value).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {report.items.length === 0 && (
            <div className="rounded-2xl border border-[#ebe4f7] bg-white p-6 text-center shadow-sm sm:rounded-3xl">
              <p className="text-sm text-[#7c7494] sm:text-base">
                No low stock items found.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}