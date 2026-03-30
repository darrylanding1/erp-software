export default function AppButton({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}) {
  const styles = {
    primary:
      'bg-[#9b6bff] text-white hover:bg-[#8756f0] border border-[#9b6bff]',
    secondary:
      'bg-white text-[#4d3188] hover:bg-[#f7f2ff] border border-[#ebe4f7]',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 border border-rose-600',
    ghost:
      'bg-[#9B8EC7] text-[#F2EAE0] hover:bg-[#dcc7ff] hover:text-[#000000] border border-transparent',
  };

  const sizes = {
    sm: 'rounded-xl px-2 py-1 text-xs sm:text-sm',
    md: 'rounded-2xl px-4 py-2.5 text-sm',
    lg: 'rounded-2xl px-5 py-3 text-sm sm:text-base',
  };

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition ${styles[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}