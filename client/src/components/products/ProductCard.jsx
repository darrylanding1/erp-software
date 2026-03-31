const badgeClassByStatus = (status) => {
  if (status === 'Out of Stock') return 'bg-red-100 text-red-700';
  if (status === 'Low Stock') return 'bg-[#fff1bf] text-[#8a6500]';
  return 'bg-[#efe4ff] text-[#7344d0]';
};

export default function ProductCard({ product, onEdit, onDelete }) {
  return (
    <div className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm sm:rounded-3xl">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex h-24 w-full items-center justify-center rounded-2xl bg-[#f7f2ff] text-3xl font-bold text-[#7344d0] sm:h-24 sm:w-24">
          {(product.name || '?').trim().charAt(0).toUpperCase() || '?'}
        </div>

        <div className="flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-bold text-[#4d3188]">{product.name}</h3>
              <p className="text-sm text-[#7c7494]">SKU: {product.sku}</p>
              <p className="text-sm text-[#7c7494]">Type: {product.item_type}</p>
              <p className="text-sm text-[#7c7494]">
                Category: {product.category_name || '-'}
              </p>
            </div>

            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${badgeClassByStatus(
                product.status
              )}`}
            >
              {product.status}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-[#fcfaff] p-3">
              <p className="text-[#7c7494]">Brand</p>
              <p className="font-semibold text-[#2b2340]">{product.brand || '-'}</p>
            </div>

            <div className="rounded-xl bg-[#fcfaff] p-3">
              <p className="text-[#7c7494]">UOM</p>
              <p className="font-semibold text-[#2b2340]">{product.uom || '-'}</p>
            </div>

            <div className="rounded-xl bg-[#fcfaff] p-3">
              <p className="text-[#7c7494]">Cost</p>
              <p className="font-semibold text-[#2b2340]">
                ₱{Number(product.standard_cost).toFixed(2)}
              </p>
            </div>

            <div className="rounded-xl bg-[#fcfaff] p-3">
              <p className="text-[#7c7494]">Sell</p>
              <p className="font-semibold text-[#2b2340]">
                ₱{Number(product.selling_price).toFixed(2)}
              </p>
            </div>

            <div className="rounded-xl bg-[#fcfaff] p-3 col-span-2">
              <p className="text-[#7c7494]">Quantity</p>
              <p className="font-semibold text-[#2b2340]">
                {Number(product.quantity).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => onEdit(product)}
              className="rounded-xl bg-[#efe4ff] px-4 py-2 text-sm font-medium text-[#7344d0] hover:bg-[#dcc7ff]"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(product.id)}
              className="rounded-xl bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 