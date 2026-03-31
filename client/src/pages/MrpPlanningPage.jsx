import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import PermissionGate from '../components/auth/PermissionGate';
import {
  getMrpMeta,
  getMrpPolicies,
  saveMrpPolicy,
  getMrpRecommendations,
  createMrpRun,
  getMrpRuns,
  getMrpRunById,
} from '../services/mrpService';

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] bg-white px-4 py-3 outline-none transition focus:border-[#9b6bff]';

const statusClassMap = {
  OK: 'bg-emerald-100 text-emerald-700',
  WATCH: 'bg-amber-100 text-amber-700',
  REORDER: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-rose-100 text-rose-700',
};

const formatNumber = (value) =>
  new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(Number(value || 0));

const todayDate = new Date().toISOString().split('T')[0];

export default function MrpPlanningPage() {
  const [meta, setMeta] = useState({
    products: [],
    warehouses: [],
    suppliers: [],
  });

  const [policyFilters, setPolicyFilters] = useState({
    warehouse_id: '',
    product_id: '',
    supplier_id: '',
  });

  const [recommendationFilters, setRecommendationFilters] = useState({
    warehouse_id: '',
    supplier_id: '',
    coverage_days: 30,
    lookback_days: 30,
    recommended_only: true,
  });

  const [policyForm, setPolicyForm] = useState({
    product_id: '',
    warehouse_id: '',
    supplier_id: '',
    reorder_point_qty: '',
    safety_stock_qty: '',
    min_stock_qty: '',
    max_stock_qty: '',
    reorder_qty: '',
    lead_time_days: '',
    coverage_days: 30,
    order_multiple_qty: '',
    min_order_qty: '',
    is_active: true,
    notes: '',
  });

  const [policies, setPolicies] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);

  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [loadingRunDetails, setLoadingRunDetails] = useState(false);

  const stats = useMemo(() => {
    const totalRecommendedQty = recommendations.reduce(
      (sum, item) => sum + Number(item.recommended_order_qty || 0),
      0
    );
    const totalRecommendedValue = recommendations.reduce(
      (sum, item) => sum + Number(item.recommended_order_value || 0),
      0
    );
    const criticalCount = recommendations.filter(
      (item) => item.planning_status === 'CRITICAL'
    ).length;

    return {
      itemCount: recommendations.length,
      totalRecommendedQty,
      totalRecommendedValue,
      criticalCount,
    };
  }, [recommendations]);

  const loadMeta = async () => {
    try {
      setLoadingMeta(true);
      const data = await getMrpMeta();
      setMeta(data);
    } catch (error) {
      console.error('Load MRP meta error:', error);
    } finally {
      setLoadingMeta(false);
    }
  };

  const loadPolicies = async () => {
    try {
      setLoadingPolicies(true);
      const data = await getMrpPolicies(policyFilters);
      setPolicies(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Load policies error:', error);
      setPolicies([]);
    } finally {
      setLoadingPolicies(false);
    }
  };

  const loadRecommendations = async () => {
    try {
      setLoadingRecommendations(true);
      const data = await getMrpRecommendations({
        ...recommendationFilters,
        recommended_only: recommendationFilters.recommended_only ? 1 : 0,
      });
      setRecommendations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Load recommendations error:', error);
      setRecommendations([]);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const loadRuns = async () => {
    try {
      setLoadingRuns(true);
      const data = await getMrpRuns({
        warehouse_id: recommendationFilters.warehouse_id,
        supplier_id: recommendationFilters.supplier_id,
      });
      setRuns(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Load runs error:', error);
      setRuns([]);
    } finally {
      setLoadingRuns(false);
    }
  };

  const loadRunDetails = async (id) => {
    try {
      setLoadingRunDetails(true);
      const data = await getMrpRunById(id);
      setSelectedRun(data);
    } catch (error) {
      console.error('Load run details error:', error);
      alert(error?.response?.data?.message || 'Failed to load MRP run details.');
    } finally {
      setLoadingRunDetails(false);
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    loadPolicies();
  }, []);

  useEffect(() => {
    loadRecommendations();
    loadRuns();
  }, []);

  const handlePolicySubmit = async (e) => {
    e.preventDefault();

    try {
      setSavingPolicy(true);

      await saveMrpPolicy({
        ...policyForm,
        product_id: Number(policyForm.product_id),
        warehouse_id: Number(policyForm.warehouse_id),
        supplier_id: policyForm.supplier_id ? Number(policyForm.supplier_id) : null,
        reorder_point_qty: Number(policyForm.reorder_point_qty || 0),
        safety_stock_qty: Number(policyForm.safety_stock_qty || 0),
        min_stock_qty: Number(policyForm.min_stock_qty || 0),
        max_stock_qty: Number(policyForm.max_stock_qty || 0),
        reorder_qty: Number(policyForm.reorder_qty || 0),
        lead_time_days: Number(policyForm.lead_time_days || 0),
        coverage_days: Number(policyForm.coverage_days || 30),
        order_multiple_qty: Number(policyForm.order_multiple_qty || 0),
        min_order_qty: Number(policyForm.min_order_qty || 0),
        is_active: policyForm.is_active ? 1 : 0,
      });

      alert('Replenishment policy saved successfully.');

      setPolicyForm({
        product_id: '',
        warehouse_id: '',
        supplier_id: '',
        reorder_point_qty: '',
        safety_stock_qty: '',
        min_stock_qty: '',
        max_stock_qty: '',
        reorder_qty: '',
        lead_time_days: '',
        coverage_days: 30,
        order_multiple_qty: '',
        min_order_qty: '',
        is_active: true,
        notes: '',
      });

      await loadPolicies();
      await loadRecommendations();
    } catch (error) {
      console.error('Save policy error:', error);
      alert(error?.response?.data?.message || 'Failed to save replenishment policy.');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handlePolicyRowUse = (item) => {
    setPolicyForm({
      product_id: String(item.product_id || ''),
      warehouse_id: String(item.warehouse_id || ''),
      supplier_id: item.supplier_id ? String(item.supplier_id) : '',
      reorder_point_qty: item.reorder_point_qty ?? '',
      safety_stock_qty: item.safety_stock_qty ?? '',
      min_stock_qty: item.min_stock_qty ?? '',
      max_stock_qty: item.max_stock_qty ?? '',
      reorder_qty: item.reorder_qty ?? '',
      lead_time_days: item.lead_time_days ?? '',
      coverage_days: item.coverage_days ?? 30,
      order_multiple_qty: item.order_multiple_qty ?? '',
      min_order_qty: item.min_order_qty ?? '',
      is_active: Number(item.is_active) === 1,
      notes: item.notes || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateRun = async () => {
    try {
      setSavingRun(true);

      const created = await createMrpRun({
        warehouse_id: recommendationFilters.warehouse_id
          ? Number(recommendationFilters.warehouse_id)
          : null,
        supplier_id: recommendationFilters.supplier_id
          ? Number(recommendationFilters.supplier_id)
          : null,
        coverage_days: Number(recommendationFilters.coverage_days || 30),
        lookback_days: Number(recommendationFilters.lookback_days || 30),
        run_notes: `Manual run ${todayDate}`,
      });

      alert(`MRP run ${created.run_number} saved successfully.`);
      await loadRuns();
      await loadRunDetails(created.run_id);
    } catch (error) {
      console.error('Create MRP run error:', error);
      alert(error?.response?.data?.message || 'Failed to save MRP run.');
    } finally {
      setSavingRun(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Planning & Replenishment / MRP-lite"
        subtitle="Manage replenishment policies, calculate shortages, and save planning runs."
        stats={[
          { label: 'Suggested Lines', value: stats.itemCount },
          { label: 'Critical', value: stats.criticalCount },
          { label: 'Suggested Qty', value: formatNumber(stats.totalRecommendedQty) },
          { label: 'Suggested Value', value: formatCurrency(stats.totalRecommendedValue) },
        ]}
      />

      <SectionCard
        title="Replenishment Policy"
        subtitle="Only users with MRP run permission can create or update replenishment policies."
      >
        <PermissionGate
          permission="mrp.run"
          fallback={
            <EmptyState message="You do not have permission to manage replenishment policies." />
          }
        >
          {loadingMeta ? (
            <EmptyState message="Loading products, warehouses, and suppliers..." />
          ) : (
            <form onSubmit={handlePolicySubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Product
                </label>
                <select
                  className={inputClassName}
                  value={policyForm.product_id}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({ ...prev, product_id: e.target.value }))
                  }
                  required
                >
                  <option value="">Select product</option>
                  {meta.products.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} - {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Warehouse
                </label>
                <select
                  className={inputClassName}
                  value={policyForm.warehouse_id}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({ ...prev, warehouse_id: e.target.value }))
                  }
                  required
                >
                  <option value="">Select warehouse</option>
                  {meta.warehouses.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} - {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Preferred Supplier
                </label>
                <select
                  className={inputClassName}
                  value={policyForm.supplier_id}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({ ...prev, supplier_id: e.target.value }))
                  }
                >
                  <option value="">None</option>
                  {meta.suppliers.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Reorder Point
                </label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClassName}
                  value={policyForm.reorder_point_qty}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      reorder_point_qty: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Safety Stock
                </label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClassName}
                  value={policyForm.safety_stock_qty}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      safety_stock_qty: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Min Stock
                </label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClassName}
                  value={policyForm.min_stock_qty}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      min_stock_qty: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Max Stock / Target
                </label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClassName}
                  value={policyForm.max_stock_qty}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      max_stock_qty: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Reorder Qty
                </label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClassName}
                  value={policyForm.reorder_qty}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({ ...prev, reorder_qty: e.target.value }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Lead Time (days)
                </label>
                <input
                  type="number"
                  className={inputClassName}
                  value={policyForm.lead_time_days}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      lead_time_days: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Coverage Days
                </label>
                <input
                  type="number"
                  className={inputClassName}
                  value={policyForm.coverage_days}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      coverage_days: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Order Multiple
                </label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClassName}
                  value={policyForm.order_multiple_qty}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      order_multiple_qty: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                  Min Order Qty
                </label>
                <input
                  type="number"
                  step="0.01"
                  className={inputClassName}
                  value={policyForm.min_order_qty}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      min_order_qty: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                Notes
              </label>
              <textarea
                rows="3"
                className={inputClassName}
                value={policyForm.notes}
                onChange={(e) =>
                  setPolicyForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-[#6e6487]">
                <input
                  type="checkbox"
                  checked={policyForm.is_active}
                  onChange={(e) =>
                    setPolicyForm((prev) => ({
                      ...prev,
                      is_active: e.target.checked,
                    }))
                  }
                />
                Active Policy
              </label>

              <AppButton type="submit" variant="primary" disabled={savingPolicy}>
                {savingPolicy ? 'Saving...' : 'Save Policy'}
              </AppButton>
            </div>
            </form>
          )}
        </PermissionGate>
      </SectionCard>

      <SectionCard title="Policy Filters">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <select
            className={inputClassName}
            value={policyFilters.product_id}
            onChange={(e) =>
              setPolicyFilters((prev) => ({ ...prev, product_id: e.target.value }))
            }
          >
            <option value="">All products</option>
            {meta.products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} - {item.name}
              </option>
            ))}
          </select>

          <select
            className={inputClassName}
            value={policyFilters.warehouse_id}
            onChange={(e) =>
              setPolicyFilters((prev) => ({ ...prev, warehouse_id: e.target.value }))
            }
          >
            <option value="">All warehouses</option>
            {meta.warehouses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} - {item.name}
              </option>
            ))}
          </select>

          <select
            className={inputClassName}
            value={policyFilters.supplier_id}
            onChange={(e) =>
              setPolicyFilters((prev) => ({ ...prev, supplier_id: e.target.value }))
            }
          >
            <option value="">All suppliers</option>
            {meta.suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <div className="flex items-end">
            <AppButton type="button" variant="secondary" onClick={loadPolicies}>
              Apply Policy Filters
            </AppButton>
          </div>
        </div>

        {loadingPolicies ? (
          <div className="mt-4 text-sm text-[#7c7494]">Loading policies...</div>
        ) : policies.length === 0 ? (
          <div className="mt-4">
            <EmptyState message="No replenishment policies found." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white">
            <table className="min-w-full">
              <thead className="bg-[#f7f2ff] text-left text-[#4d3188]">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">ROP</th>
                  <th className="px-4 py-3">Safety</th>
                  <th className="px-4 py-3">Max</th>
                  <th className="px-4 py-3">Lead Time</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((item) => (
                  <tr key={item.id} className="border-t border-[#ebe4f7]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#4d3188]">{item.product_name}</div>
                      <div className="text-xs text-[#7c7494]">{item.sku}</div>
                    </td>
                    <td className="px-4 py-3">{item.warehouse_name}</td>
                    <td className="px-4 py-3">{item.supplier_name || '—'}</td>
                    <td className="px-4 py-3">{formatNumber(item.reorder_point_qty)}</td>
                    <td className="px-4 py-3">{formatNumber(item.safety_stock_qty)}</td>
                    <td className="px-4 py-3">{formatNumber(item.max_stock_qty)}</td>
                    <td className="px-4 py-3">{item.lead_time_days} days</td>
                    <td className="px-4 py-3">
                      <AppButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePolicyRowUse(item)}
                      >
                        Use in Form
                      </AppButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="MRP Filters & Recommendations">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <select
            className={inputClassName}
            value={recommendationFilters.warehouse_id}
            onChange={(e) =>
              setRecommendationFilters((prev) => ({
                ...prev,
                warehouse_id: e.target.value,
              }))
            }
          >
            <option value="">All warehouses</option>
            {meta.warehouses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} - {item.name}
              </option>
            ))}
          </select>

          <select
            className={inputClassName}
            value={recommendationFilters.supplier_id}
            onChange={(e) =>
              setRecommendationFilters((prev) => ({
                ...prev,
                supplier_id: e.target.value,
              }))
            }
          >
            <option value="">All suppliers</option>
            {meta.suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <input
            type="number"
            className={inputClassName}
            value={recommendationFilters.coverage_days}
            onChange={(e) =>
              setRecommendationFilters((prev) => ({
                ...prev,
                coverage_days: e.target.value,
              }))
            }
            placeholder="Coverage days"
          />

          <input
            type="number"
            className={inputClassName}
            value={recommendationFilters.lookback_days}
            onChange={(e) =>
              setRecommendationFilters((prev) => ({
                ...prev,
                lookback_days: e.target.value,
              }))
            }
            placeholder="Lookback days"
          />

          <label className="inline-flex items-center gap-2 rounded-2xl border border-[#ebe4f7] bg-white px-4 py-3 text-sm text-[#6e6487]">
            <input
              type="checkbox"
              checked={recommendationFilters.recommended_only}
              onChange={(e) =>
                setRecommendationFilters((prev) => ({
                  ...prev,
                  recommended_only: e.target.checked,
                }))
              }
            />
            Show reorder only
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <AppButton type="button" variant="primary" onClick={loadRecommendations}>
            Refresh Recommendations
          </AppButton>

          <AppButton type="button" variant="secondary" onClick={handleCreateRun} disabled={savingRun}>
            {savingRun ? 'Saving Run...' : 'Save MRP Run'}
          </AppButton>
        </div>

        {loadingRecommendations ? (
          <div className="mt-4 text-sm text-[#7c7494]">Calculating recommendations...</div>
        ) : recommendations.length === 0 ? (
          <div className="mt-4">
            <EmptyState message="No replenishment recommendations found." />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white">
            <table className="min-w-full">
              <thead className="bg-[#f7f2ff] text-left text-[#4d3188]">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Warehouse</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Available</th>
                  <th className="px-4 py-3">Open PO</th>
                  <th className="px-4 py-3">Open SO</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Projected Net</th>
                  <th className="px-4 py-3">Recommended Qty</th>
                  <th className="px-4 py-3">Suggested Value</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((item) => (
                  <tr key={`${item.product_id}-${item.warehouse_id}`} className="border-t border-[#ebe4f7]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#4d3188]">{item.product_name}</div>
                      <div className="text-xs text-[#7c7494]">
                        {item.sku} {item.supplier_name ? `• ${item.supplier_name}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">{item.warehouse_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          statusClassMap[item.planning_status] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.planning_status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatNumber(item.available_qty)}</td>
                    <td className="px-4 py-3">{formatNumber(item.open_po_qty)}</td>
                    <td className="px-4 py-3">{formatNumber(item.open_so_qty)}</td>
                    <td className="px-4 py-3">{formatNumber(item.reorder_trigger_qty)}</td>
                    <td className="px-4 py-3">{formatNumber(item.target_stock_qty)}</td>
                    <td className="px-4 py-3">{formatNumber(item.projected_net_qty)}</td>
                    <td className="px-4 py-3 font-semibold text-[#4d3188]">
                      {formatNumber(item.recommended_order_qty)}
                    </td>
                    <td className="px-4 py-3">{formatCurrency(item.recommended_order_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Saved MRP Runs">
        {loadingRuns ? (
          <div className="text-sm text-[#7c7494]">Loading runs...</div>
        ) : runs.length === 0 ? (
          <EmptyState message="No MRP runs saved yet." />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1.4fr]">
            <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white">
              <table className="min-w-full">
                <thead className="bg-[#f7f2ff] text-left text-[#4d3188]">
                  <tr>
                    <th className="px-4 py-3">Run</th>
                    <th className="px-4 py-3">Items</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((item) => (
                    <tr key={item.id} className="border-t border-[#ebe4f7]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#4d3188]">{item.run_number}</div>
                        <div className="text-xs text-[#7c7494]">
                          {item.warehouse_name || 'All warehouses'} • {item.supplier_name || 'All suppliers'}
                        </div>
                      </td>
                      <td className="px-4 py-3">{item.total_items}</td>
                      <td className="px-4 py-3">{formatCurrency(item.total_recommended_value)}</td>
                      <td className="px-4 py-3">
                        <AppButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => loadRunDetails(item.id)}
                        >
                          View
                        </AppButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-3xl border border-[#ebe4f7] bg-white p-4">
              {loadingRunDetails ? (
                <div className="text-sm text-[#7c7494]">Loading run details...</div>
              ) : !selectedRun ? (
                <EmptyState message="Select an MRP run to view details." />
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-[#4d3188]">{selectedRun.run_number}</h3>
                    <p className="text-sm text-[#7c7494]">
                      {selectedRun.warehouse_name || 'All warehouses'} •{' '}
                      {selectedRun.supplier_name || 'All suppliers'}
                    </p>
                    <p className="mt-1 text-sm text-[#7c7494]">
                      Coverage: {selectedRun.coverage_days} days • Lookback:{' '}
                      {selectedRun.lookback_days} days
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[#ebe4f7] bg-[#faf7ff] p-3">
                      <p className="text-xs uppercase text-[#8f85aa]">Items</p>
                      <p className="mt-1 text-lg font-bold text-[#4d3188]">
                        {selectedRun.total_items}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[#ebe4f7] bg-[#faf7ff] p-3">
                      <p className="text-xs uppercase text-[#8f85aa]">Suggested Value</p>
                      <p className="mt-1 text-lg font-bold text-[#4d3188]">
                        {formatCurrency(selectedRun.total_recommended_value)}
                      </p>
                    </div>
                  </div>

                  <div className="max-h-[420px] overflow-auto rounded-2xl border border-[#ebe4f7]">
                    <table className="min-w-full">
                      <thead className="bg-[#f7f2ff] text-left text-[#4d3188]">
                        <tr>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2">Projected</th>
                          <th className="px-3 py-2">Recommend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRun.items?.map((item) => (
                          <tr key={item.id} className="border-t border-[#ebe4f7]">
                            <td className="px-3 py-2">
                              <div className="font-medium text-[#4d3188]">{item.product_name}</div>
                              <div className="text-xs text-[#7c7494]">{item.sku}</div>
                            </td>
                            <td className="px-3 py-2">{formatNumber(item.projected_net_qty)}</td>
                            <td className="px-3 py-2 font-semibold text-[#4d3188]">
                              {formatNumber(item.recommended_order_qty)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}