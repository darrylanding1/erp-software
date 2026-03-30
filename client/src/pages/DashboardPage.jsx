import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  ShoppingCart,
} from 'lucide-react';
import { getDashboardData } from '../services/dashboardService';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import AppButton from '../components/common/AppButton';
import EmptyState from '../components/common/EmptyState';
import StatusBadge from '../components/common/StatusBadge';

export default function DashboardPage() {
  const navigate = useNavigate();

  const [data, setData] = useState({
    totalProducts: 0,
    lowStockCount: 0,
    criticalStockCount: 0,
    totalCategories: 0,
    totalUsers: 0,
    lowStockItems: [],
    recentActions: [],
  });

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const result = await getDashboardData();
        setData(result);
      } catch (error) {
        console.error('Dashboard fetch failed:', error);
      }
    };

    fetchDashboard();
  }, []);

  const stats = useMemo(
    () => [
      { label: 'Products', value: data.totalProducts },
      { label: 'Categories', value: data.totalCategories },
      { label: 'Low Stock', value: data.lowStockCount, variant: 'warning' },
      {
        label: 'Critical',
        value: data.criticalStockCount,
        variant: 'danger',
      },
    ],
    [data]
  );

  return (
    <div className="space-y-4 sm:space-y-5 lg:space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Monitor inventory health, recent actions, and low stock alerts."
        stats={stats}
        actions={
          <>
            <AppButton variant="primary" onClick={() => navigate('/products')}>
              View Products
            </AppButton>
            <AppButton variant="primary" onClick={() => navigate('/movements')}>
              View Movements
            </AppButton>
            <AppButton onClick={() => navigate('/purchases')}>Create PO</AppButton>
          </>
        }
        alert={
          data.criticalStockCount > 0 ? (
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-rose-100 p-3 text-rose-700">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="font-semibold text-rose-800">Critical Stock Alert</h3>
                <p className="mt-1 text-sm text-rose-700">
                  {data.criticalStockCount} product
                  {data.criticalStockCount > 1 ? 's are' : ' is'} at 5 units or
                  below.
                </p>
              </div>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <SectionCard
          title="Recent Actions"
          subtitle="Latest stock movements and activity."
          className="xl:col-span-2"
          action={
            <AppButton
              variant="ghost"
              size="sm"
              onClick={() => navigate('/movements')}
            >
              View All
            </AppButton>
          }
        >
          <div className="space-y-3">
            {data.recentActions?.length === 0 ? (
              <EmptyState message="No recent actions found." />
            ) : (
              data.recentActions.map((action) => (
                <div
                  key={action.id}
                  className="flex flex-col gap-3 rounded-2xl border border-[#f1ebfb] bg-[#fcfaff] p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-[#efe4ff] p-3 text-[#6d3fd1]">
                      <ArrowLeftRight size={18} />
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[#2b2340]">
                          {action.product_name}
                        </p>
                        <StatusBadge value={action.movement_type} />
                      </div>
                      <p className="mt-1 text-sm text-[#7c7494]">
                        SKU: {action.sku} • Qty: {action.quantity}
                      </p>
                      {action.note && (
                        <p className="mt-1 text-sm text-[#6e6487]">{action.note}</p>
                      )}
                    </div>
                  </div>

                  <div className="text-sm text-[#7c7494] md:text-right">
                    {new Date(action.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Low Stock"
          subtitle="Products that need replenishment soon."
          action={
            <AppButton variant="ghost" onClick={() => navigate('/products')}>
              Open
            </AppButton>
          }
        >
          <div className="space-y-3">
            {data.lowStockItems?.length === 0 ? (
              <EmptyState message="No low stock items found." />
            ) : (
              data.lowStockItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[#f1ebfb] bg-[#fcfaff] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#2b2340]">{item.name}</p>
                      <p className="mt-1 text-sm text-[#7c7494]">SKU: {item.sku}</p>
                      <p className="mt-1 text-sm text-[#7c7494]">
                        {item.category_name || 'No Category'}
                      </p>
                    </div>

                    <div className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                      {item.quantity} left
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <AppButton
            className="mt-5 w-full"
            onClick={() => navigate('/purchases')}
          >
            <ShoppingCart size={18} />
            Restock Now
          </AppButton>
        </SectionCard>
      </div>
    </div>
  );
}