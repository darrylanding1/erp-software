export default function PageHeader({
  title,
  subtitle,
  stats = [],
  actions = null,
  alert = null,
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-gradient-to-r from-[#efe4ff] to-[#fff9e8] p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#4d3188] sm:text-2xl lg:text-3xl">
              {title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-[#6e6487] sm:text-base">
              {subtitle}
            </p>
          </div>

          {(stats.length > 0 || actions) && (
            <div className="flex w-full flex-col gap-3 xl:w-auto xl:items-end">
              {stats.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className={`rounded-2xl px-4 py-3 text-center shadow-sm ${
                        stat.variant === 'danger'
                          ? 'bg-rose-50 text-rose-700'
                          : stat.variant === 'warning'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-white/80 text-[#4d3188]'
                      }`}
                    >
                      <p className="text-xs text-[#7c7494] sm:text-sm">
                        {stat.label}
                      </p>
                      <p className="text-lg font-bold">{stat.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
            </div>
          )}
        </div>
      </section>

      {alert && (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 p-4 shadow-sm sm:p-5">
          {alert}
        </section>
      )}
    </div>
  );
}