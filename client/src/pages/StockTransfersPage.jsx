import { useEffect, useState } from 'react';
import {
  getStockTransfers,
  createStockTransfer,
  postStockTransfer,
} from '../services/stockTransferService';

const initialItem = {
  product_id: '',
  quantity: '',
  unit_cost: '',
  from_bin_id: '',
  to_bin_id: '',
  lot_id: '',
};

export default function StockTransfersPage() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    transfer_date: new Date().toISOString().slice(0, 10),
    from_warehouse_id: '',
    from_bin_id: '',
    to_warehouse_id: '',
    to_bin_id: '',
    remarks: '',
    items: [{ ...initialItem }],
  });
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    try {
      const data = await getStockTransfers();
      setRows(data);
    } catch (error) {
      console.error(error);
      alert('Failed to load transfers');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateItem = (index, key, value) => {
    setForm((prev) => {
      const nextItems = [...prev.items];
      nextItems[index] = {
        ...nextItems[index],
        [key]: value,
      };
      return {
        ...prev,
        items: nextItems,
      };
    });
  };

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { ...initialItem }],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await createStockTransfer({
        ...form,
        items: form.items.map((item) => ({
          ...item,
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost || 0),
          from_bin_id: item.from_bin_id ? Number(item.from_bin_id) : null,
          to_bin_id: item.to_bin_id ? Number(item.to_bin_id) : null,
          lot_id: item.lot_id ? Number(item.lot_id) : null,
        })),
      });

      alert('Transfer created successfully');
      setForm({
        transfer_date: new Date().toISOString().slice(0, 10),
        from_warehouse_id: '',
        from_bin_id: '',
        to_warehouse_id: '',
        to_bin_id: '',
        remarks: '',
        items: [{ ...initialItem }],
      });
      await loadData();
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to create transfer');
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async (id) => {
    try {
      await postStockTransfer(id);
      alert('Transfer posted successfully');
      await loadData();
    } catch (error) {
      console.error(error);
      alert(error?.response?.data?.message || 'Failed to post transfer');
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-sm border border-[#ebe4f7]">
        <h1 className="text-2xl font-bold text-[#4d3188]">Stock Transfers</h1>
        <p className="mt-1 text-sm text-[#7c7494]">
          Transfer stock by warehouse and bin.
        </p>
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-3xl bg-white p-6 shadow-sm border border-[#ebe4f7] space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="date"
            className="rounded-2xl border border-[#d9c8ff] px-4 py-3"
            value={form.transfer_date}
            onChange={(e) => setForm({ ...form, transfer_date: e.target.value })}
          />
          <input
            placeholder="From Warehouse ID"
            className="rounded-2xl border border-[#d9c8ff] px-4 py-3"
            value={form.from_warehouse_id}
            onChange={(e) => setForm({ ...form, from_warehouse_id: e.target.value })}
          />
          <input
            placeholder="To Warehouse ID"
            className="rounded-2xl border border-[#d9c8ff] px-4 py-3"
            value={form.to_warehouse_id}
            onChange={(e) => setForm({ ...form, to_warehouse_id: e.target.value })}
          />
        </div>

        {form.items.map((item, index) => (
          <div
            key={index}
            className="grid grid-cols-1 md:grid-cols-5 gap-3 rounded-2xl border border-[#efe4ff] p-4"
          >
            <input
              placeholder="Product ID"
              className="rounded-2xl border border-[#d9c8ff] px-4 py-3"
              value={item.product_id}
              onChange={(e) => updateItem(index, 'product_id', e.target.value)}
            />
            <input
              placeholder="Quantity"
              className="rounded-2xl border border-[#d9c8ff] px-4 py-3"
              value={item.quantity}
              onChange={(e) => updateItem(index, 'quantity', e.target.value)}
            />
            <input
              placeholder="Unit Cost"
              className="rounded-2xl border border-[#d9c8ff] px-4 py-3"
              value={item.unit_cost}
              onChange={(e) => updateItem(index, 'unit_cost', e.target.value)}
            />
            <input
              placeholder="From Bin ID"
              className="rounded-2xl border border-[#d9c8ff] px-4 py-3"
              value={item.from_bin_id}
              onChange={(e) => updateItem(index, 'from_bin_id', e.target.value)}
            />
            <input
              placeholder="To Bin ID"
              className="rounded-2xl border border-[#d9c8ff] px-4 py-3"
              value={item.to_bin_id}
              onChange={(e) => updateItem(index, 'to_bin_id', e.target.value)}
            />
          </div>
        ))}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={addItem}
            className="rounded-2xl bg-[#f7f2ff] px-4 py-3 text-[#4d3188] border border-[#ebe4f7]"
          >
            Add Item
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-[#9b6bff] px-5 py-3 text-white"
          >
            {loading ? 'Saving...' : 'Create Transfer'}
          </button>
        </div>
      </form>

      <section className="rounded-3xl bg-white p-6 shadow-sm border border-[#ebe4f7]">
        <h2 className="text-xl font-semibold text-[#4d3188] mb-4">Transfer List</h2>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-[#f7f2ff] text-[#4d3188]">
              <tr>
                <th className="px-4 py-3 text-left">Number</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">From</th>
                <th className="px-4 py-3 text-left">To</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#f1e8ff]">
                  <td className="px-4 py-3">{row.transfer_number}</td>
                  <td className="px-4 py-3">{row.transfer_date}</td>
                  <td className="px-4 py-3">{row.from_warehouse_name}</td>
                  <td className="px-4 py-3">{row.to_warehouse_name}</td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">
                    {row.status !== 'Posted' && (
                      <button
                        type="button"
                        onClick={() => handlePost(row.id)}
                        className="rounded-xl bg-[#4d3188] px-3 py-2 text-white"
                      >
                        Post
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-6 text-center text-[#7c7494]">
                    No transfers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}