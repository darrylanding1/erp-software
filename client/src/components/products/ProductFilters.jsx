export default function ProductFilters({
  filters,
  onChange,
  onClear,
  categories = [],
  enums = {
    itemTypes: [],
    statuses: [],
  },
}) {
  return (
    <div className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <input
          type="text"
          name="search"
          placeholder="Search name / SKU / barcode / brand"
          value={filters.search}
          onChange={onChange}
          className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none focus:border-[#9b6bff] sm:text-base"
        />

        <select
          name="category_id"
          value={filters.category_id}
          onChange={onChange}
          className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none focus:border-[#9b6bff] sm:text-base"
        >
          <option value="">All Categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          name="item_type"
          value={filters.item_type}
          onChange={onChange}
          className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none focus:border-[#9b6bff] sm:text-base"
        >
          <option value="">All Item Types</option>
          {enums.itemTypes.map((itemType) => (
            <option key={itemType} value={itemType}>
              {itemType}
            </option>
          ))}
        </select>

        <select
          name="status"
          value={filters.status}
          onChange={onChange}
          className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none focus:border-[#9b6bff] sm:text-base"
        >
          <option value="">All Stock Status</option>
          {enums.statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select
          name="is_active"
          value={filters.is_active}
          onChange={onChange}
          className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none focus:border-[#9b6bff] sm:text-base"
        >
          <option value="">All Active States</option>
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>

        <button
          type="button"
          onClick={onClear}
          className="w-full rounded-2xl bg-[#f4c430] px-4 py-3 text-sm font-semibold text-[#3d2f00] transition hover:bg-[#e5b91f] sm:text-base"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}