"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/admin/payments", label: "Payments", icon: "💳" },
  { href: "/admin/balance", label: "Balance", icon: "💰" },
  { href: "/admin/providers", label: "SMM API", icon: "🔑" },
  { href: "/admin/services", label: "Services", icon: "🛍️" },
  { href: "/admin/digital", label: "Digital", icon: "🛒" },
  { href: "/admin/packages", label: "Packages", icon: "📦" },
  { href: "/admin/audit", label: "Audit Logs", icon: "📋" },
  { href: "/admin/settings", label: "Settings", icon: "⚙️" },
];

type AdminInfo = { id: string; username: string | null; displayName: string | null; role: string; permissions: string[] };

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/auth/me").then(r => r.json()).then(j => {
      if (!j.ok) { router.replace("/admin/login"); return; }
      setAdmin(j.data);
    }).catch(() => router.replace("/admin/login")).finally(() => setLoading(false));
  }, [router]);

  async function logout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">Loading…</div>;
  if (!admin) return null;

  const NavLinks = () => (
    <>
      {NAV.map(n => {
        const active = pathname === n.href || pathname.startsWith(n.href + "/");
        return (
          <Link key={n.href} href={n.href} onClick={() => setDrawer(false)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
            <span className="text-base">{n.icon}</span>{n.label}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="hidden lg:flex w-64 flex-col border-r border-white/10 bg-slate-900/50">
        <div className="p-5 border-b border-white/10">
          <div className="font-bold text-lg tracking-tight">AngKer Admin</div>
          <div className="text-xs text-slate-400 mt-0.5">{admin.displayName || admin.username} · {admin.role}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto"><NavLinks /></nav>
        <div className="p-3 border-t border-white/10">
          <button onClick={logout} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-300 transition">
            <span>🚪</span> Logout
          </button>
        </div>
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-slate-900 border-r border-white/10 flex flex-col">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div><div className="font-bold">AngKer Admin</div><div className="text-xs text-slate-400">{admin.role}</div></div>
              <button onClick={() => setDrawer(false)} className="text-slate-400 p-2">✕</button>
            </div>
            <nav className="flex-1 p-3 space-y-1"><NavLinks /></nav>
            <div className="p-3 border-t border-white/10">
              <button onClick={logout} className="w-full text-left px-3 py-2.5 text-sm text-red-300">🚪 Logout</button>
            </div>
          </aside>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center gap-3 border-b border-white/10 px-4 py-3 bg-slate-900/80 sticky top-0 z-20">
          <button onClick={() => setDrawer(true)} className="rounded-lg p-2 hover:bg-white/5 text-slate-300" aria-label="Menu">☰</button>
          <div className="font-semibold text-sm truncate">AngKer Admin</div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
