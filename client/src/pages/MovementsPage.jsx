import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import { getProducts } from '../services/productService';
import {
  getMovementMeta,
  getStockOverview,
  getTransfers,
  createTransfer,
  getMovements,
} from '../services/movementService';

const today = new Date().toISOString().split('T')[0];

export default function MovementsPage() {
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [overviewRows, setOverviewRows] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [movements, setMovements] = useState([]);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingTransfers, setLoadingTransfers] = useState(true);
  const [loadingMovements, setLoadingMovements] = useState(true);
  const [submittingTransfer, setSubmittingTransfer] = useState(false);

  const [overviewFilters, setOverviewFilters] = useState({
    search: '',
    warehouse_id: '',
    status: '',
  });

  const [transferFilters, setTransferFilters] = useState({
    search: '',
    product_id: '',
    warehouse_id: '',
  });

  const [movementFilters, setMovementFilters] = useState({
    product_id: '',
    warehouse_id: '',
    movement_type: '',
  });

  const [transferForm, setTransferForm] = useState({
    product_id: '',
    from_warehouse_id: '',
    to_warehouse_id: '',
    quantity: '',
    transfer_date: today,
    remarks: '',
  });

  const fetchProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data);
    } catch (error) {
      console.error('Fetch products failed:', error);
    }
  };

  const fetchMeta = async () => {
    try {
      const data = await getMovementMeta();
      setWarehouses(data.warehouses || []);
    } catch (error) {
      console.error('Fetch movement meta failed:', error);
    }
  };

  const fetchOverview = async (params = {}) => {
    try {
      setLoadingOverview(true);
      const data = await getStockOverview(params);
      setOverviewRows(data.overview || []);
      if ((data.warehouses || []).length > 0) {
        setWarehouses(data.warehouses);
      }
    } catch (error) {
      console.error('Fetch stock overview failed:', error);
    } finally {
      setLoadingOverview(false);
    }
  };

  const fetchTransfers = async (params = {}) => {
    try {
      setLoadingTransfers(true);
      const data = await getTransfers(params);
      setTransfers(data);
    } catch (error) {
      console.error('Fetch transfers failed:', error);
    } finally {
      setLoadingTransfers(false);
    }
  };

  const fetchMovements = async (params = {}) => {
    try {
      setLoadingMovements(true);
      const data = await getMovements(params);
      setMovements(data);
    } catch (error) {
      console.error('Fetch movements failed:', error);
    } finally {
      setLoadingMovements(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchMeta();
    fetchOverview();
    fetchTransfers();
    fetchMovements();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchTransfers(transferFilters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [transferFilters]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchMovements(movementFilters);
    }, 300);

    return () => clearTimeout(timeout);
  }, [movementFilters]);

  const filteredOverview = useMemo(() => {
    return overviewRows.filter((item) => {
      const matchesSearch =
        !overviewFilters.search ||
        item.name.toLowerCase().includes(overviewFilters.search.toLowerCase()) ||
        item.sku.toLowerCase().includes(overviewFilters.search.toLowerCase());

      const matchesStatus =
        !overviewFilters.status || item.stock_status === overviewFilters.status;

      const selectedWarehouseId = Number(overviewFilters.warehouse_id);
      const selectedWarehouseQty = overviewFilters.warehouse_id
        ? Number(item.warehouse_quantities?.[selectedWarehouseId] || 0)
        : item.total_quantity;

      const matchesWarehouse =
        !overviewFilters.warehouse_id || selectedWarehouseQty >= 0;

      return matchesSearch && matchesStatus && matchesWarehouse;
    });
  }, [overviewRows, overviewFilters]);

  const selectedFromWarehouseQty = useMemo(() => {
    if (!transferForm.product_id || !transferForm.from_warehouse_id) return 0;

    const selectedProduct = overviewRows.find(
      (item) => Number(item.id) === Number(transferForm.product_id)
    );

    if (!selectedProduct) return 0;

    return Number(
      selectedProduct.warehouse_quantities?.[Number(transferForm.from_warehouse_id)] || 0
    );
  }, [overviewRows, transferForm.product_id, transferForm.from_warehouse_id]);

  const transferSummary = useMemo(() => {
    const totalUnits = overviewRows.reduce(
      (sum, item) => sum + Number(item.total_quantity || 0),
      0
    );

    return {
      totalSkus: overviewRows.length,
      totalWarehouses: warehouses.length,
      totalTransfers: transfers.length,
      totalUnits,
    };
  }, [overviewRows, warehouses.length, transfers.length]);

  const handleTransferSubmit = async (e) => {
    e.preventDefault();

    if (
      Number(transferForm.quantity) <= 0 ||
      Number(transferForm.quantity) > selectedFromWarehouseQty
    ) {
      alert('Transfer quantity is invalid or exceeds available source stock.');
      return;
    }

    try {
      setSubmittingTransfer(true);

      await createTransfer({
        ...transferForm,
        product_id: Number(transferForm.product_id),
        from_warehouse_id: Number(transferForm.from_warehouse_id),
        to_warehouse_id: Number(transferForm.to_warehouse_id),
        quantity: Number(transferForm.quantity),
      });

      setTransferForm({
        product_id: '',
        from_warehouse_id: '',
        to_warehouse_id: '',
        quantity: '',
        transfer_date: today,
        remarks: '',
      });

      await Promise.all([
        fetchOverview(),
        fetchTransfers(transferFilters),
        fetchMovements(movementFilters),
        fetchProducts(),
      ]);

      alert('Warehouse transfer saved successfully.');
    } catch (error) {
      console.error('Create transfer failed:', error);
      alert(error?.response?.data?.message || 'Failed to create warehouse transfer');
    } finally {
      setSubmittingTransfer(false);
    }
  };

  const getStatusClasses = (status) => {
    if (status === 'Out of Stock') return 'bg-rose-100 text-rose-700';
    if (status === 'Low Stock') return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  const getMovementTypeClasses = (type) => {
    if (type === 'Transfer Out') return 'bg-rose-100 text-rose-700';
    if (type === 'Transfer In') return 'bg-emerald-100 text-emerald-700';
    if (type === 'Adjustment') return 'bg-amber-100 text-amber-700';
    if (type === 'Restock') return 'bg-blue-100 text-blue-700';
    return 'bg-violet-100 text-violet-700';
  };

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Warehouse Transfer + Stock Overview"
        subtitle="View stock by warehouse, transfer inventory between locations, and review transfer activity."
        stats={[
          { label: 'Warehouses', value: transferSummary.totalWarehouses },
          { label: 'SKUs', value: transferSummary.totalSkus },
          { label: 'Transfers', value: transferSummary.totalTransfers },
          { label: 'Units', value: transferSummary.totalUnits },
        ]}
      />

      <SectionCard
        title="Transfer Stock"
        subtitle="Move inventory from one warehouse to another while keeping stock movement history."
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <select
              value={transferForm.product_id}
              onChange={(e) =>
                setTransferForm((prev) => ({ ...prev, product_id: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              required
            >
              <option value="">Select Product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </select>

            <select
              value={transferForm.from_warehouse_id}
              onChange={(e) =>
                setTransferForm((prev) => ({
                  ...prev,
                  from_warehouse_id: e.target.value,
                }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              required
            >
              <option value="">From Warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>

            <select
              value={transferForm.to_warehouse_id}
              onChange={(e) =>
                setTransferForm((prev) => ({
                  ...prev,
                  to_warehouse_id: e.target.value,
                }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              required
            >
              <option value="">To Warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              value={transferForm.quantity}
              onChange={(e) =>
                setTransferForm((prev) => ({ ...prev, quantity: e.target.value }))
              }
              placeholder="Transfer Quantity"
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              required
            />

            <input
              type="date"
              value={transferForm.transfer_date}
              onChange={(e) =>
                setTransferForm((prev) => ({ ...prev, transfer_date: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
              required
            />

            <input
              type="text"
              value={transferForm.remarks}
              onChange={(e) =>
                setTransferForm((prev) => ({ ...prev, remarks: e.target.value }))
              }
              placeholder="Remarks / Reason"
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-[#fcfaff] p-4">
              <p className="text-sm text-[#7c7494]">Available in source warehouse</p>
              <p className="mt-1 text-2xl font-bold text-[#4d3188]">
                {selectedFromWarehouseQty}
              </p>
            </div>

            <div className="rounded-2xl bg-[#fcfaff] p-4">
              <p className="text-sm text-[#7c7494]">Selected quantity</p>
              <p className="mt-1 text-2xl font-bold text-[#4d3188]">
                {transferForm.quantity || 0}
              </p>
            </div>

            <div className="rounded-2xl bg-[#fcfaff] p-4">
              <p className="text-sm text-[#7c7494]">Balance after transfer</p>
              <p className="mt-1 text-2xl font-bold text-[#4d3188]">
                {Math.max(
                  0,
                  selectedFromWarehouseQty - Number(transferForm.quantity || 0)
                )}
              </p>
            </div>
          </div>

          <AppButton type="submit" size="lg" disabled={submittingTransfer}>
            {submittingTransfer ? 'Saving Transfer...' : 'Save Transfer'}
          </AppButton>
        </form>
      </SectionCard>

      <SectionCard
        title="Stock Overview by Warehouse"
        subtitle="See total inventory and stock distribution per warehouse."
        action={
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setOverviewFilters({
                search: '',
                warehouse_id: '',
                status: '',
              })
            }
          >
            Clear Filters
          </AppButton>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="text"
              placeholder="Search product or SKU"
              value={overviewFilters.search}
              onChange={(e) =>
                setOverviewFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />

            <select
              value={overviewFilters.warehouse_id}
              onChange={(e) =>
                setOverviewFilters((prev) => ({ ...prev, warehouse_id: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Warehouses</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>

            <select
              value={overviewFilters.status}
              onChange={(e) =>
                setOverviewFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Status</option>
              <option value="In Stock">In Stock</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
          </div>

          {loadingOverview ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading stock overview...
            </div>
          ) : filteredOverview.length === 0 ? (
            <EmptyState message="No stock overview records found." />
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm xl:block">
                <table className="min-w-full text-center">
                  <thead className="bg-[#f7f2ff]">
                    <tr className="text-[#4d3188]">
                      <th className="px-6 py-4 text-left">Product</th>
                      <th className="px-6 py-4">SKU</th>
                      <th className="px-6 py-4">Category</th>
                      {warehouses.map((warehouse) => (
                        <th key={warehouse.id} className="px-6 py-4">
                          {warehouse.code}
                        </th>
                      ))}
                      <th className="px-6 py-4">Total</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOverview.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]"
                      >
                        <td className="px-6 py-4 text-left font-medium text-[#2b2340]">
                          {item.name}
                        </td>
                        <td className="px-6 py-4">{item.sku}</td>
                        <td className="px-6 py-4">{item.category_name || '-'}</td>

                        {warehouses.map((warehouse) => (
                          <td key={warehouse.id} className="px-6 py-4">
                            {item.warehouse_quantities?.[warehouse.id] ?? 0}
                          </td>
                        ))}

                        <td className="px-6 py-4 font-bold text-[#4d3188]">
                          {item.total_quantity}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getStatusClasses(
                              item.stock_status
                            )}`}
                          >
                            {item.stock_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:hidden">
                {filteredOverview.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-[#4d3188]">{item.name}</h3>
                        <p className="text-sm text-[#7c7494]">{item.sku}</p>
                      </div>

                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusClasses(
                          item.stock_status
                        )}`}
                      >
                        {item.stock_status}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {warehouses.map((warehouse) => (
                        <div key={warehouse.id} className="rounded-xl bg-[#fcfaff] p-3">
                          <p className="text-xs text-[#7c7494]">{warehouse.code}</p>
                          <p className="mt-1 font-semibold text-[#2b2340]">
                            {item.warehouse_quantities?.[warehouse.id] ?? 0}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 rounded-xl bg-[#f7f2ff] p-3">
                      <p className="text-sm text-[#7c7494]">Total</p>
                      <p className="mt-1 text-lg font-bold text-[#4d3188]">
                        {item.total_quantity}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Transfer History"
        subtitle="Review completed warehouse transfers."
        action={
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setTransferFilters({
                search: '',
                product_id: '',
                warehouse_id: '',
              })
            }
          >
            Clear Filters
          </AppButton>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              type="text"
              placeholder="Search transfer number, product, or SKU"
              value={transferFilters.search}
              onChange={(e) =>
                setTransferFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            />

            <select
              value={transferFilters.product_id}
              onChange={(e) =>
                setTransferFilters((prev) => ({ ...prev, product_id: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </select>

            <select
              value={transferFilters.warehouse_id}
              onChange={(e) =>
                setTransferFilters((prev) => ({ ...prev, warehouse_id: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Warehouses</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>
          </div>

          {loadingTransfers ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading transfers...
            </div>
          ) : transfers.length === 0 ? (
            <EmptyState message="No warehouse transfers found." />
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm xl:block">
                <table className="min-w-full text-center">
                  <thead className="bg-[#f7f2ff]">
                    <tr className="text-[#4d3188]">
                      <th className="px-6 py-4">Transfer No.</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Product</th>
                      <th className="px-6 py-4">SKU</th>
                      <th className="px-6 py-4">From</th>
                      <th className="px-6 py-4">To</th>
                      <th className="px-6 py-4">Qty</th>
                      <th className="px-6 py-4">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map((item) => (
                      <tr key={item.id} className="border-t border-[#ebe4f7]">
                        <td className="px-6 py-4 font-medium text-[#2b2340]">
                          {item.transfer_number}
                        </td>
                        <td className="px-6 py-4">
                          {new Date(item.transfer_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">{item.product_name}</td>
                        <td className="px-6 py-4">{item.sku}</td>
                        <td className="px-6 py-4">
                          {item.from_warehouse_name} ({item.from_warehouse_code})
                        </td>
                        <td className="px-6 py-4">
                          {item.to_warehouse_name} ({item.to_warehouse_code})
                        </td>
                        <td className="px-6 py-4 font-bold text-[#4d3188]">
                          {item.quantity}
                        </td>
                        <td className="px-6 py-4">{item.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:hidden">
                {transfers.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-[#4d3188]">
                          {item.transfer_number}
                        </h3>
                        <p className="text-sm text-[#7c7494]">
                          {new Date(item.transfer_date).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="rounded-full bg-[#efe4ff] px-3 py-1 text-sm font-semibold text-[#7344d0]">
                        Qty {item.quantity}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3">
                      <div className="rounded-xl bg-[#fcfaff] p-3">
                        <p className="text-xs text-[#7c7494]">Product</p>
                        <p className="font-semibold text-[#2b2340]">
                          {item.product_name} ({item.sku})
                        </p>
                      </div>

                      <div className="rounded-xl bg-[#fcfaff] p-3">
                        <p className="text-xs text-[#7c7494]">Route</p>
                        <p className="font-semibold text-[#2b2340]">
                          {item.from_warehouse_name} ({item.from_warehouse_code}) →{' '}
                          {item.to_warehouse_name} ({item.to_warehouse_code})
                        </p>
                      </div>

                      <div className="rounded-xl bg-[#fcfaff] p-3">
                        <p className="text-xs text-[#7c7494]">Remarks</p>
                        <p className="font-semibold text-[#2b2340]">
                          {item.remarks || '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Recent Warehouse Movements"
        subtitle="Transfer-in and transfer-out logs plus other warehouse movement entries."
        action={
          <AppButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setMovementFilters({
                product_id: '',
                warehouse_id: '',
                movement_type: '',
              })
            }
          >
            Clear Filters
          </AppButton>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <select
              value={movementFilters.product_id}
              onChange={(e) =>
                setMovementFilters((prev) => ({ ...prev, product_id: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </option>
              ))}
            </select>

            <select
              value={movementFilters.warehouse_id}
              onChange={(e) =>
                setMovementFilters((prev) => ({ ...prev, warehouse_id: e.target.value }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Warehouses</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
            </select>

            <select
              value={movementFilters.movement_type}
              onChange={(e) =>
                setMovementFilters((prev) => ({
                  ...prev,
                  movement_type: e.target.value,
                }))
              }
              className="rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
            >
              <option value="">All Types</option>
              <option value="Transfer In">Transfer In</option>
              <option value="Transfer Out">Transfer Out</option>
              <option value="Stock In">Stock In</option>
              <option value="Stock Out">Stock Out</option>
              <option value="Adjustment">Adjustment</option>
              <option value="Restock">Restock</option>
            </select>
          </div>

          {loadingMovements ? (
            <div className="rounded-2xl bg-[#fcfaff] p-5 text-sm text-[#7c7494]">
              Loading movement logs...
            </div>
          ) : movements.length === 0 ? (
            <EmptyState message="No stock movement logs found." />
          ) : (
            <>
              <div className="hidden overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm xl:block">
                <table className="min-w-full text-center">
                  <thead className="bg-[#f7f2ff]">
                    <tr className="text-[#4d3188]">
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4">Product</th>
                      <th className="px-6 py-4">SKU</th>
                      <th className="px-6 py-4">Warehouse</th>
                      <th className="px-6 py-4">Type</th>
                      <th className="px-6 py-4">Qty</th>
                      <th className="px-6 py-4">Previous</th>
                      <th className="px-6 py-4">New</th>
                      <th className="px-6 py-4">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((item) => (
                      <tr key={item.id} className="border-t border-[#ebe4f7]">
                        <td className="px-6 py-4">
                          {new Date(item.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4">{item.product_name}</td>
                        <td className="px-6 py-4">{item.sku}</td>
                        <td className="px-6 py-4">
                          {item.warehouse_name
                            ? `${item.warehouse_name} (${item.warehouse_code})`
                            : '-'}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getMovementTypeClasses(
                              item.movement_type
                            )}`}
                          >
                            {item.movement_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-[#4d3188]">
                          {item.quantity}
                        </td>
                        <td className="px-6 py-4">{item.previous_quantity}</td>
                        <td className="px-6 py-4">{item.new_quantity}</td>
                        <td className="px-6 py-4">{item.note || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:hidden">
                {movements.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-[#4d3188]">
                          {item.product_name}
                        </h3>
                        <p className="text-sm text-[#7c7494]">{item.sku}</p>
                      </div>

                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getMovementTypeClasses(
                          item.movement_type
                        )}`}
                      >
                        {item.movement_type}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-[#fcfaff] p-3">
                        <p className="text-[#7c7494]">Warehouse</p>
                        <p className="font-semibold text-[#2b2340]">
                          {item.warehouse_name
                            ? `${item.warehouse_name} (${item.warehouse_code})`
                            : '-'}
                        </p>
                      </div>

                      <div className="rounded-xl bg-[#fcfaff] p-3">
                        <p className="text-[#7c7494]">Quantity</p>
                        <p className="font-semibold text-[#2b2340]">{item.quantity}</p>
                      </div>

                      <div className="rounded-xl bg-[#fcfaff] p-3">
                        <p className="text-[#7c7494]">Previous</p>
                        <p className="font-semibold text-[#2b2340]">
                          {item.previous_quantity}
                        </p>
                      </div>

                      <div className="rounded-xl bg-[#fcfaff] p-3">
                        <p className="text-[#7c7494]">New</p>
                        <p className="font-semibold text-[#2b2340]">
                          {item.new_quantity}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-[#fcfaff] p-3">
                      <p className="text-[#7c7494]">Note</p>
                      <p className="font-semibold text-[#2b2340]">{item.note || '-'}</p>
                    </div>

                    <p className="mt-3 text-xs text-[#7c7494]">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  );
}