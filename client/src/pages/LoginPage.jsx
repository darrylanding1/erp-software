import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  // 🔒 Fixed credentials
  const email = "admin@inventorypro.local";
  const password = "Admin@123";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-lg shadow-md w-96"
      >
        <h2 className="text-2xl font-bold mb-4 text-center">
          System Login
        </h2>

        {/* EMAIL */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            readOnly
            className="w-full px-3 py-2 border rounded bg-gray-100 cursor-not-allowed"
          />
        </div>

        {/* PASSWORD */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">
            Password
          </label>
          <input
            type="text"
            value={password}
            readOnly
            className="w-full px-3 py-2 border rounded bg-gray-100 cursor-not-allowed"
          />
        </div>

        {/* BUTTON */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}