export default function EmptyState({ message = 'No records found.' }) {
  return (
    <div className="rounded-2xl bg-[#fcfaff] p-6 text-center text-sm text-[#7c7494]">
      {message}
    </div>
  );
}