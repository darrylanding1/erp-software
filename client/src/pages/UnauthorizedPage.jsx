import { Link } from 'react-router-dom';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f5ff] px-6">
      <div className="max-w-lg rounded-[2rem] border border-[#ebe4f7] bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-bold text-[#4d3188]">Access denied</h1>
        <p className="mt-3 text-[#6e6487]">
          Your account does not have permission to view this page.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-2xl bg-[#9b6bff] px-5 py-3 font-semibold text-white transition hover:bg-[#8756f0]"
        >
          Go back to dashboard
        </Link>
      </div>
    </div>
  );
}