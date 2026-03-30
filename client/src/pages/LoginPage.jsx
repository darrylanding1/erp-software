import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = location.state?.from?.pathname || '/';

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(form);
      navigate(from, { replace: true });
    } catch (err) {
      console.error('Login failed:', err);
      setError(err?.response?.data?.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f5ff] px-4 py-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-[#ebe4f7] bg-white shadow-xl lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hidden bg-gradient-to-br from-[#efe4ff] via-[#f8f5ff] to-[#fff8eb] p-10 lg:block">
          <div className="max-w-md">
            <p className="inline-flex rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-[#6d3fd1] shadow-sm">
              Inventory Pro
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-tight text-[#4d3188]">
              Secure access for your inventory and ERP workflows.
            </h1>
            <p className="mt-4 text-base leading-7 text-[#6e6487]">
              This build adds hashed passwords, JWT authentication, role-based access control,
              frontend route guards, and audit trail logging for sensitive actions.
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-10">
          <div className="mx-auto w-full max-w-md">
            <h2 className="text-3xl font-bold text-[#4d3188]">Sign in</h2>
            <p className="mt-2 text-sm text-[#7c7494]">
              Use your system email and password.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#5f547c]">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#5f547c]">Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none focus:border-[#9b6bff]"
                  placeholder="Enter your password"
                  required
                />
              </div>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[#9b6bff] px-4 py-3 font-semibold text-white transition hover:bg-[#8756f0] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}