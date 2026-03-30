export default function StatusBadge({ value }) {
  const normalized = String(value || '').toLowerCase();

  let classes = 'bg-slate-100 text-slate-700';

  if (
    normalized.includes('active') ||
    normalized.includes('received') ||
    normalized.includes('completed') ||
    normalized.includes('in stock') ||
    normalized.includes('stock in')
  ) {
    classes = 'bg-emerald-100 text-emerald-700';
  } else if (
    normalized.includes('pending') ||
    normalized.includes('low') ||
    normalized.includes('partial') ||
    normalized.includes('draft')
  ) {
    classes = 'bg-amber-100 text-amber-700';
  } else if (
    normalized.includes('inactive') ||
    normalized.includes('cancelled') ||
    normalized.includes('critical') ||
    normalized.includes('stock out')
  ) {
    classes = 'bg-rose-100 text-rose-700';
  } else if (normalized.includes('adjustment')) {
    classes = 'bg-blue-100 text-blue-700';
  }

  return (
    <span
      className={`inline-flex min-w-fit shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${classes}`}
    >
      {value || '-'}
    </span>
  );
}