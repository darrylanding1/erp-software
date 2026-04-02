import PermissionGate from '../auth/PermissionGate';

const badgeClassByStatus = (status) => {
  if (status === 'Out of Stock') return 'bg-red-100 text-red-700';
  if (status === 'Low Stock') return 'bg-[#fff1bf] text-[#8a6500]';
  return 'bg-[#efe4ff] text-[#7344d0]';
};

const badgeClassByItemStatus = (status) => {
  if (status === 'BLOCKED') return 'bg-red-100 text-red-700';
  if (status === 'DRAFT') return 'bg-slate-200 text-slate-700';
  if (status === 'DISCONTINUED') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
};

export default function ProductTable({ products, onEdit, onDelete }) {
  return (
    <div className="hidden overflow-x-auto rounded-3xl border border-[#ebe4f7] bg-white shadow-sm md:block">
      <table className="min-w-full text-left">
        <thead className="bg-[#f7f2ff]">
          <tr className="text-[#4d3188]">
            <th className="px-4 py-4">Item</th>
            <th className="px-4 py-4">Type</th>
            <th className="px-4 py-4">Item Status</th>
            <th className="px-4 py-4">Category</th>
            <th className="px-4 py-4">Base / Sales / Purchase UOM</th>
            <th className="px-4 py-4">Valuation</th>
            <th className="px-4 py-4">Procurement</th>
            <th className="px-4 py-4">Standard Cost</th>
            <th className="px-4 py-4">Selling Price</th>
            <th className="px-4 py-4">Qty</th>
            <th className="px-4 py-4">Stock Status</th>
            <th className="px-4 py-4 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id} className="border-t border-[#ebe4f7] hover:bg-[#faf7ff]">
              <td className="px-4 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f7f2ff] text-lg font-bold text-[#7344d0]">
                    {(product.name || '?').trim().charAt(0).toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-[#2b2340]">{product.name}</p>
                    <p className="text-xs text-[#7c7494]">SKU: {product.sku}</p>
                    <p className="text-xs text-[#7c7494]">Barcode: {product.barcode || '-'}</p>
                    <p className="text-xs text-[#7c7494]">Variant: {product.variant_code || '-'}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">{product.item_type}</td>
              <td className="px-4 py-4">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${badgeClassByItemStatus(product.item_status)}`}>
                  {product.item_status}
                </span>
              </td>
              <td className="px-4 py-4">{product.category_name || '-'}</td>
              <td className="px-4 py-4 text-xs text-[#2b2340]">
                <div>Base: {product.base_uom_code || '-'}</div>
                <div>Sales: {product.sales_uom_code || '-'}</div>
                <div>Purchase: {product.purchase_uom_code || '-'}</div>
              </td>
              <td className="px-4 py-4">{product.valuation_method}</td>
              <td className="px-4 py-4">{product.procurement_type}</td>
              <td className="px-4 py-4">₱{Number(product.standard_cost || 0).toFixed(2)}</td>
              <td className="px-4 py-4">₱{Number(product.selling_price || 0).toFixed(2)}</td>
              <td className="px-4 py-4">{Number(product.quantity || 0).toFixed(2)}</td>
              <td className="px-4 py-4">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${badgeClassByStatus(product.status)}`}>
                  {product.status}
                </span>
              </td>
              <td className="px-4 py-4">
                <div className="flex justify-center gap-2">
                  <PermissionGate permission="products.update">
                    <button
                      type="button"
                      onClick={() => onEdit(product)}
                      className="rounded-xl bg-[#9B8EC7] px-3 py-2 text-sm font-medium text-[#F2EAE0] hover:bg-[#dcc7ff] hover:text-[#000000]"
                    >
                      Edit
                    </button>
                  </PermissionGate>
                  <PermissionGate permission="products.delete">
                    <button
                      type="button"
                      onClick={() => onDelete(product.id)}
                      className="rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </PermissionGate>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
