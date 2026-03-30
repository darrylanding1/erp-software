export default function SectionCard({
  title,
  subtitle,
  action = null,
  children,
  className = '',
}) {
  return (
    <section
      className={`rounded-2xl border border-[#ebe4f7] bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6 ${className}`}
    >
      {(title || subtitle || action) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-[#4d3188] sm:text-lg">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-[#7c7494]">{subtitle}</p>
            )}
          </div>

          {action}
        </div>
      )}

      {children}
    </section>
  );
}