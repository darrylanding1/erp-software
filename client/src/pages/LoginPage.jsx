import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();

  const email = 'admin@inventorypro.local';
  const password = 'Admin@123';

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
      await login({ email, password });
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
        
        {/* LEFT PANEL (UNCHANGED) */}
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

        {/* RIGHT PANEL */}
        <div className="p-6 sm:p-10">
          <div className="mx-auto w-full max-w-md">
            <h2 className="text-3xl font-bold text-[#4d3188]">Sign in</h2>

            <p className="mt-2 text-sm text-[#7c7494]">
              Demo login (read-only credentials)
            </p>

            <form
              onSubmit={handleSubmit}
              className="mt-8 space-y-4"
              name="login_form"
              autoComplete="on"
            >
              {/* EMAIL */}
              <div>
                <label
                  htmlFor="login_email"
                  className="mb-2 block text-sm font-medium text-[#5f547c]"
                >
                  Email
                </label>

                <input
                  id="login_email"
                  type="email"
                  value={email}
                  readOnly
                  className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none bg-gray-100 cursor-not-allowed"
                />
              </div>

              {/* PASSWORD */}
              <div>
                <label
                  htmlFor="login_password"
                  className="mb-2 block text-sm font-medium text-[#5f547c]"
                >
                  Password
                </label>

                <input
                  id="login_password"
                  type="text"
                  value={password}
                  readOnly
                  className="w-full rounded-2xl border border-[#ebe4f7] px-4 py-3 outline-none bg-gray-100 cursor-not-allowed"
                />
              </div>

              {/* ERROR */}
              {error ? (
                <div
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                  role="alert"
                >
                  {error}
                </div>
              ) : null}

              {/* BUTTON */}
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