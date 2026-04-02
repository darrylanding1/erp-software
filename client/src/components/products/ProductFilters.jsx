export default function ProductFilters({
  filters,
  onChange,
  onClear,
  categories = [],
  enums = {
    itemTypes: [],
    itemStatuses: [],
    valuationMethods: [],
    procurementTypes: [],
    planningStrategies: [],
    statuses: [],
  },
}) {
  const inputClass = 'w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 text-sm outline-none focus:border-[#9b6bff] sm:text-base';

  return (
    <div className="rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-8">
        <input
          type="text"
          name="search"
          placeholder="Search name / SKU / barcode / brand / MPN"
          value={filters.search}
          onChange={onChange}
          className={inputClass}
        />

        <select name="category_id" value={filters.category_id} onChange={onChange} className={inputClass}>
          <option value="">All Categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select name="item_type" value={filters.item_type} onChange={onChange} className={inputClass}>
          <option value="">All Item Types</option>
          {enums.itemTypes.map((itemType) => (
            <option key={itemType} value={itemType}>
              {itemType}
            </option>
          ))}
        </select>

        <select name="item_status" value={filters.item_status} onChange={onChange} className={inputClass}>
          <option value="">All Item Statuses</option>
          {enums.itemStatuses.map((itemStatus) => (
            <option key={itemStatus} value={itemStatus}>
              {itemStatus}
            </option>
          ))}
        </select>

        <select name="valuation_method" value={filters.valuation_method} onChange={onChange} className={inputClass}>
          <option value="">All Valuation Methods</option>
          {enums.valuationMethods.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>

        <select name="procurement_type" value={filters.procurement_type} onChange={onChange} className={inputClass}>
          <option value="">All Procurement Types</option>
          {enums.procurementTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <select name="planning_strategy" value={filters.planning_strategy} onChange={onChange} className={inputClass}>
          <option value="">All Planning Strategies</option>
          {enums.planningStrategies.map((strategy) => (
            <option key={strategy} value={strategy}>
              {strategy}
            </option>
          ))}
        </select>

        <select name="status" value={filters.status} onChange={onChange} className={inputClass}>
          <option value="">All Stock Status</option>
          {enums.statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select name="is_active" value={filters.is_active} onChange={onChange} className={inputClass}>
          <option value="">All Active States</option>
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>

        <select name="track_inventory" value={filters.track_inventory} onChange={onChange} className={inputClass}>
          <option value="">All Inventory Flags</option>
          <option value="1">Tracks Inventory</option>
          <option value="0">No Inventory Tracking</option>
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
