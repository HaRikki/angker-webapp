"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.error || "Login failed"); return; }
      router.replace("/admin/dashboard");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 border border-indigo-400/30 mb-4">
            <span className="text-2xl">🛡️</span>
          </div>
          <h1 className="text-2xl font-bold text-white">AngKer Admin</h1>
          <p className="text-slate-400 text-sm mt-1">Secure administration panel</p>
        </div>
        <form onSubmit={onSubmit} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl space-y-4">
          {error && <div className="rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-sm px-3 py-2">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Username or Email</label>
            <input type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" placeholder="admin" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3.5 py-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" placeholder="••••••••" required />
          </div>
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-2.5 transition">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-xs text-slate-500 mt-6">Authorized personnel only</p>
      </div>
    </div>
  );
}
