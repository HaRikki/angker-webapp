"use client";
import { useState } from "react";

export default function BalancePage() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState<"add" | "deduct">("add");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<any>(null);

  async function search() {
    setErr("");
    const j = await fetch("/api/admin/balance?q=" + encodeURIComponent(q)).then((r) => r.json());
    if (!j.ok) { setErr(j.error); return; }
    setUsers(j.data.users);
    if (j.data.users[0]) { setUserId(j.data.users[0].id); setSelected(j.data.users[0]); }
  }

  async function submit() {
    setErr(""); setMsg("");
    if (!confirm((direction === "add" ? "Add" : "Deduct") + " $" + amount + "?")) return;
    const j = await fetch("/api/admin/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, amount: Number(amount), reason, direction }),
    }).then((r) => r.json());
    if (!j.ok) { setErr(j.error); return; }
    setMsg("Success. New balance: $" + Number(j.data.balanceAfter).toFixed(2));
    search();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">Balance Management</h1>
      <p className="text-sm text-slate-400">Add or deduct with ledger + audit log</p>
      {err && <div className="text-red-300 bg-red-500/10 rounded-lg px-3 py-2 text-sm">{err}</div>}
      {msg && <div className="text-emerald-300 bg-emerald-500/10 rounded-lg px-3 py-2 text-sm">{msg}</div>}
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="User ID, username, or email" className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm" />
        <button onClick={search} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium">Search</button>
      </div>
      {selected && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm space-y-1">
            <div className="font-semibold text-base">{selected.username}</div>
            <div className="text-slate-400">{selected.email}</div>
            <div className="text-2xl font-bold text-emerald-300 pt-2">${selected.balance.toFixed(2)}</div>
            <div className="text-xs text-slate-500">Deposits: ${selected.totalDeposits.toFixed(2)} · Spent: ${selected.totalSpent.toFixed(2)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="flex gap-2">
              <button onClick={() => setDirection("add")} className={`flex-1 rounded-lg py-2 text-sm ${direction === "add" ? "bg-emerald-600" : "bg-white/5"}`}>➕ Add</button>
              <button onClick={() => setDirection("deduct")} className={`flex-1 rounded-lg py-2 text-sm ${direction === "deduct" ? "bg-red-600" : "bg-white/5"}`}>➖ Deduct</button>
            </div>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 text-sm" />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required, min 3 chars)" className="w-full rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2 text-sm" />
            <button onClick={submit} className={`w-full rounded-xl py-2.5 text-sm font-semibold ${direction === "add" ? "bg-emerald-600" : "bg-red-600"}`}>Confirm</button>
          </div>
          <div className="lg:col-span-2 rounded-2xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 font-semibold text-sm">Recent Transactions</div>
            <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
              {(selected.recentTransactions || []).map((t: any) => (
                <div key={t.id} className="px-4 py-2 text-sm flex flex-wrap gap-2">
                  <span className="text-xs text-slate-500 w-36">{new Date(t.createdAt).toLocaleString()}</span>
                  <span className="w-28">{t.type}</span>
                  <span className={t.amount >= 0 ? "text-emerald-300" : "text-red-300"}>{t.amount >= 0 ? "+" : ""}{t.amount.toFixed(2)}</span>
                  <span className="text-slate-400">→ ${t.balanceAfter.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
