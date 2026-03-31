import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import PermissionGate from '../components/auth/PermissionGate';
import {
  getPurchaseRequisitionMeta,
  getPurchaseRequisitions,
  getPurchaseRequisitionById,
  createPurchaseRequisitionFromMrpRun,
  submitPurchaseRequisition,
  approvePurchaseRequisition,
  convertPurchaseRequisitionToPo,
} from '../services/purchaseRequisitionService';

const inputClassName =
  'w-full rounded-2xl border border-[#ebe4f7] bg-white px-4 py-3 outline-none transition focus:border-[#9b6bff]';

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

const today = new Date().toISOString().split('T')[0];

export default function PurchaseRequisitionsPage() {
  const [meta, setMeta] = useState({
    mrpRuns: [],
    suppliers: [],
    warehouses: [],
  });

  const [filters, setFilters] = useState({
    status: '',
    mrp_run_id: '',
  });

  const [form, setForm] = useState({
    mrp_run_id: '',
    requisition_date: today,
    remarks: '',
  });

  const [convertForm, setConvertForm] = useState({
    order_date: today,
    notes: '',
  });

  const [requisitions, setRequisitions] = useState([]);
  const [selectedRequisition, setSelectedRequisition] = useState(null);

  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingRequisitions, setLoadingRequisitions] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);

  const stats = useMemo(() => {
    const total = requisitions.length;
    const approved = requisitions.filter((item) => item.status === 'Approved').length;
    const converted = requisitions.filter((item) => item.status === 'Converted').length;
    const totalValue = requisitions.reduce(
      (sum, item) => sum + Number(item.total_amount || 0),
      0
    );

    return {
      total,
      approved,
      converted,
      totalValue,
    };
  }, [requisitions]);

  const loadMeta = async () => {
    try {
      setLoadingMeta(true);
      const data = await getPurchaseRequisitionMeta();
      setMeta(data);
    } catch (error) {
      console.error('Load requisition meta error:', error);
    } finally {
      setLoadingMeta(false);
    }
  };

  const loadRequisitions = async () => {
    try {
      setLoadingRequisitions(true);
      const data = await getPurchaseRequisitions(filters);
      setRequisitions(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Load requisitions error:', error);
      setRequisitions([]);
    } finally {
      setLoadingRequisitions(false);
    }
  };

  const loadDetails = async (id) => {
    try {
      setLoadingDetails(true);
      const data = await getPurchaseRequisitionById(id);
      setSelectedRequisition(data);
    } catch (error) {
      console.error('Load requisition details error:', error);
      alert(error?.response?.data?.message || 'Failed to load requisition details.');
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    loadMeta();
    loadRequisitions();
  }, []);

  const handleCreateFromRun = async (e) => {
    e.preventDefault();

    if (!form.mrp_run_id) {
      alert('Select an MRP run first.');
      return;
    }

    try {
      setSaving(true);

      const result = await createPurchaseRequisitionFromMrpRun(form.mrp_run_id, {
        requisition_date: form.requisition_date,
        remarks: form.remarks,
      });

      alert(result.message || 'Purchase requisition created successfully.');

      setForm({
        mrp_run_id: '',
        requisition_date: today,
        remarks: '',
      });

      await loadRequisitions();

      if (result?.item?.id) {
        await loadDetails(result.item.id);
      }
    } catch (error) {
      console.error('Create requisition from MRP error:', error);
      alert(error?.response?.data?.message || 'Failed to create purchase requisition.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (id) => {
    try {
      setSaving(true);
      const result = await submitPurchaseRequisition(id);
      alert(result.message || 'Purchase requisition submitted.');
      await loadRequisitions();
      await loadDetails(id);
    } catch (error) {
      console.error('Submit requisition error:', error);
      alert(error?.response?.data?.message || 'Failed to submit requisition.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      setSaving(true);
      const result = await approvePurchaseRequisition(id);
      alert(result.message || 'Purchase requisition approved.');
      await loadRequisitions();
      await loadDetails(id);
    } catch (error) {
      console.error('Approve requisition error:', error);
      alert(error?.response?.data?.message || 'Failed to approve requisition.');
    } finally {
      setSaving(false);
    }
  };

  const handleConvert = async (id) => {
    try {
      setSaving(true);
      const result = await convertPurchaseRequisitionToPo(id, convertForm);
      const createdCount = Array.isArray(result.purchase_orders)
        ? result.purchase_orders.length
        : 0;

      alert(
        `${result.message || 'Purchase orders created.'} ${createdCount} PO(s) generated.`
      );

      await loadRequisitions();
      await loadDetails(id);
    } catch (error) {
      console.error('Convert requisition to PO error:', error);
      alert(error?.response?.data?.message || 'Failed to convert requisition to PO.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Purchase Requisitions"
        subtitle="Convert MRP recommendations into approved requisitions and supplier purchase orders."
        stats={[
          { label: 'Total PRs', value: stats.total },
          { label: 'Approved', value: stats.approved },
          { label: 'Converted', value: stats.converted },
          { label: 'Total Value', value: formatCurrency(stats.totalValue) },
        ]}
      />

      <SectionCard title="Create Purchase Requisition from MRP Run">
        {loadingMeta ? (
          <EmptyState message="Loading MRP runs..." />
        ) : (
          <form onSubmit={handleCreateFromRun} className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                MRP Run
              </label>
              <select
                className={inputClassName}
                value={form.mrp_run_id}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, mrp_run_id: e.target.value }))
                }
                required
              >
                <option value="">Select MRP run</option>
                {meta.mrpRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.run_number} • {formatNumber(run.total_recommended_qty)} qty •{' '}
                    {formatCurrency(run.total_recommended_value)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                Requisition Date
              </label>
              <input
                type="date"
                className={inputClassName}
                value={form.requisition_date}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, requisition_date: e.target.value }))
                }
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                Remarks
              </label>
              <input
                type="text"
                className={inputClassName}
                value={form.remarks}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, remarks: e.target.value }))
                }
                placeholder="Optional remarks"
              />
            </div>

            <div className="md:col-span-4">
              <PermissionGate permission="purchase_requisitions.create">
                <AppButton type="submit" variant="primary" disabled={saving}>
                  {saving ? 'Processing...' : 'Create PR from MRP Run'}
                </AppButton>
              </PermissionGate>
            </div>
          </form>
        )}
      </SectionCard>

      <SectionCard title="Filters">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <select
            className={inputClassName}
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, status: e.target.value }))
            }
          >
            <option value="">All statuses</option>
            <option value="Draft">Draft</option>
            <option value="Submitted">Submitted</option>
            <option value="Approved">Approved</option>
            <option value="Partially Ordered">Partially Ordered</option>
            <option value="Converted">Converted</option>
          </select>

          <select
            className={inputClassName}
            value={filters.mrp_run_id}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, mrp_run_id: e.target.value }))
            }
          >
            <option value="">All MRP runs</option>
            {meta.mrpRuns.map((run) => (
              <option key={run.id} value={run.id}>
                {run.run_number}
              </option>
            ))}
          </select>

          <div className="flex items-end">
            <AppButton type="button" variant="secondary" onClick={loadRequisitions}>
              Apply Filters
            </AppButton>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Purchase Requisitions">
        {loadingRequisitions ? (
          <div className="text-sm text-[#7c7494]">Loading purchase requisitions...</div>
        ) : requisitions.length === 0 ? (
          <EmptyState message="No purchase requisitions found." />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1.4fr]">
            <div className="overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white">
              <table className="min-w-full">
                <thead className="bg-[#f7f2ff] text-left text-[#4d3188]">
                  <tr>
                    <th className="px-4 py-3">PR</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {requisitions.map((item) => (
                    <tr key={item.id} className="border-t border-[#ebe4f7]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#4d3188]">{item.pr_number}</div>
                        <div className="text-xs text-[#7c7494]">
                          {item.run_number || 'Manual'} • {item.requisition_date}
                        </div>
                      </td>
                      <td className="px-4 py-3">{item.status}</td>
                      <td className="px-4 py-3">{formatCurrency(item.total_amount)}</td>
                      <td className="px-4 py-3">
                        <AppButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => loadDetails(item.id)}
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
              {loadingDetails ? (
                <div className="text-sm text-[#7c7494]">Loading requisition details...</div>
              ) : !selectedRequisition ? (
                <EmptyState message="Select a requisition to view details." />
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-[#4d3188]">
                      {selectedRequisition.pr_number}
                    </h3>
                    <p className="text-sm text-[#7c7494]">
                      {selectedRequisition.run_number || 'Manual'} • Status:{' '}
                      {selectedRequisition.status}
                    </p>
                    <p className="text-sm text-[#7c7494]">
                      Total: {formatCurrency(selectedRequisition.total_amount)}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <PermissionGate permission="purchase_requisitions.create">
                      <AppButton
                        type="button"
                        variant="secondary"
                        disabled={saving || selectedRequisition.status !== 'Draft'}
                        onClick={() => handleSubmit(selectedRequisition.id)}
                      >
                        Submit PR
                      </AppButton>
                    </PermissionGate>

                    <AppButton
                      type="button"
                      variant="secondary"
                      disabled={
                        saving ||
                        !['Submitted', 'Partially Ordered'].includes(
                          selectedRequisition.status
                        )
                      }
                      onClick={() => handleApprove(selectedRequisition.id)}
                    >
                      Approve PR
                    </AppButton>
                  </div>

                  <div className="rounded-2xl border border-[#ebe4f7] bg-[#faf7ff] p-4">
                    <h4 className="font-semibold text-[#4d3188]">Convert to Purchase Orders</h4>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                          Order Date
                        </label>
                        <input
                          type="date"
                          className={inputClassName}
                          value={convertForm.order_date}
                          onChange={(e) =>
                            setConvertForm((prev) => ({
                              ...prev,
                              order_date: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-[#6e6487]">
                          Notes
                        </label>
                        <input
                          type="text"
                          className={inputClassName}
                          value={convertForm.notes}
                          onChange={(e) =>
                            setConvertForm((prev) => ({
                              ...prev,
                              notes: e.target.value,
                            }))
                          }
                          placeholder="Optional PO notes"
                        />
                      </div>
                    </div>

                    <div className="mt-3">
                      <AppButton
                        type="button"
                        variant="primary"
                        disabled={
                          saving ||
                          !['Approved', 'Partially Ordered'].includes(
                            selectedRequisition.status
                          )
                        }
                        onClick={() => handleConvert(selectedRequisition.id)}
                      >
                        Convert Approved PR to PO(s)
                      </AppButton>
                    </div>
                  </div>

                  <div className="max-h-[420px] overflow-auto rounded-2xl border border-[#ebe4f7]">
                    <table className="min-w-full">
                      <thead className="bg-[#f7f2ff] text-left text-[#4d3188]">
                        <tr>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2">Warehouse</th>
                          <th className="px-3 py-2">Supplier</th>
                          <th className="px-3 py-2">Requested</th>
                          <th className="px-3 py-2">Ordered</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRequisition.items?.map((item) => (
                          <tr key={item.id} className="border-t border-[#ebe4f7]">
                            <td className="px-3 py-2">
                              <div className="font-medium text-[#4d3188]">{item.product_name}</div>
                              <div className="text-xs text-[#7c7494]">{item.sku}</div>
                            </td>
                            <td className="px-3 py-2">{item.warehouse_name}</td>
                            <td className="px-3 py-2">
                              {item.preferred_supplier_name || 'Missing supplier'}
                            </td>
                            <td className="px-3 py-2">
                              {formatNumber(item.requested_quantity)}
                            </td>
                            <td className="px-3 py-2">
                              {formatNumber(item.ordered_quantity)}
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
