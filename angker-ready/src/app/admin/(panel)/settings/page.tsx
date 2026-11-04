"use client";
import { useState } from "react";
export default function SettingsPage() {
  const [cur, setCur] = useState(""); const [neu, setNeu] = useState(""); const [conf, setConf] = useState("");
  const [err, setErr] = useState(""); const [msg, setMsg] = useState("");
  async function submit() {
    setErr(""); setMsg("");
    if (neu !== conf) { setErr("Passwords do not match"); return; }
    const j = await fetch("/api/admin/auth/change-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: cur, newPassword: neu }),
    }).then(r => r.json());
    if (!j.ok) { setErr(j.error); return; }
    setMsg("Password changed"); setCur(""); setNeu(""); setConf("");
  }
  return (
    <div className="space-y-4 max-w-md">
      <h1 className="text-xl font-bold">Settings</h1>
      {err && <div className="text-red-300 text-sm">{err}</div>}
      {msg && <div className="text-emerald-300 text-sm">{msg}</div>}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
        <input type="password" value={cur} onChange={e => setCur(e.target.value)} placeholder="Current password" className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 text-sm" />
        <input type="password" value={neu} onChange={e => setNeu(e.target.value)} placeholder="New password (min 8)" className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 text-sm" />
        <input type="password" value={conf} onChange={e => setConf(e.target.value)} placeholder="Confirm" className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 text-sm" />
        <button onClick={submit} className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold">Change Password</button>
      </div>
    </div>
  );
}
