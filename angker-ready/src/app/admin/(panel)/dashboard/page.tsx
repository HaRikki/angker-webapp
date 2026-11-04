"use client";
import { useEffect, useState } from "react";
function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <div className="text-xs text-slate-400 font-medium">{label}</div>
      <div className="text-2xl font-bold mt-1 tracking-tight">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}
export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [range, setRange] = useState("30d");
  const [err, setErr] = useState("");
  useEffect(() => {
    setData(null);
    fetch(`/api/admin/dashboard?range=${range}`).then(r => r.json()).then(j => {
      if (!j.ok) setErr(j.error); else setData(j.data);
    }).catch(() => setErr("Failed to load"));
  }, [range]);
  if (err) return <div className="text-red-400">{err}</div>;
  if (!data) return <div className="text-slate-400">Loading dashboard…</div>;
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div><h1 className="text-xl sm:text-2xl font-bold">Dashboard</h1><p className="text-sm text-slate-400">Overview of AngKer SMM</p></div>
        <div className="flex gap-2 flex-wrap">
          {(["today","7d","30d","all"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${range===r?"bg-indigo-600 text-white":"bg-white/5 text-slate-300 hover:bg-white/10"}`}>
              {r==="today"?"Today":r==="7d"?"7 Days":r==="30d"?"30 Days":"All"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card label="Total Users" value={data.totalUsers} />
        <Card label="Wallet Balance" value={`$${data.totalWalletBalance.toFixed(2)}`} />
        <Card label="Successful Deposits" value={data.deposits.paid?.count ?? 0} sub={`$${(data.deposits.paid?.sum ?? 0).toFixed(2)}`} />
        <Card label="Pending Payments" value={data.deposits.pending?.count ?? 0} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card label="Total Services" value={data.services.total} />
        <Card label="Active Services" value={data.services.active} />
        <Card label="Disabled Services" value={data.services.disabled} />
        <Card label="Total Orders" value={data.orders.total} sub={`Pending: ${data.orders.pending}`} />
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 font-semibold text-sm">Recent Admin Activities</div>
        <div className="divide-y divide-white/5">
          {(data.recentActivities||[]).length===0 && <div className="px-4 py-6 text-sm text-slate-500">No activities yet</div>}
          {(data.recentActivities||[]).map((a: any) => (
            <div key={a.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
              <span className="font-mono text-xs text-slate-500 w-40 shrink-0">{new Date(a.createdAt).toLocaleString()}</span>
              <span className="font-medium">{a.action}</span>
              <span className="text-slate-400">{a.entityType}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full w-fit ${a.result==="ok"?"bg-emerald-500/15 text-emerald-300":a.result==="denied"?"bg-amber-500/15 text-amber-300":"bg-red-500/15 text-red-300"}`}>{a.result}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
