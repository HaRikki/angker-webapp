"use client";
import { useCallback, useEffect, useState } from "react";
import { IconTile, PremiumIcon } from "./PremiumIcon";
import { money } from "@/lib/format";
import { Loader2 } from "lucide-react";
import { DigitalStoreAdminView } from "./DigitalStoreAdminView";

type Tab =
  | "home"
  | "users"
  | "balance"
  | "payments"
  | "providers"
  | "services"
  | "orders"
  | "digital"
  | "reports"
  | "settings";

const TABS: { id: Tab; icon: any; label: string }[] = [
  { id: "home", icon: "admin", label: "Home" },
  { id: "users", icon: "profile", label: "Users" },
  { id: "services", icon: "smm", label: "SMM" },
  { id: "orders", icon: "orders", label: "Orders" },
  { id: "digital", icon: "digital", label: "Digital" },
  { id: "payments", icon: "wallet", label: "Pay" },
  { id: "providers", icon: "key", label: "API" },
  { id: "reports", icon: "card", label: "Report" },
  { id: "settings", icon: "admin", label: "Set" },
];

export function MiniAdminView() {
  const [tab, setTab] = useState<Tab>("home");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // shared data
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [qUser, setQUser] = useState("");
  const [userDetail, setUserDetail] = useState<any>(null);
  const [adj, setAdj] = useState<{ userId: string; amount: string; direction: "add" | "deduct" } | null>(null);

  const [svcs, setSvcs] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [showAddSvc, setShowAddSvc] = useState(false);
  const [svcForm, setSvcForm] = useState({
    name: "",
    description: "",
    categoryId: "",
    costPrice: 0,
    sellPrice: 1,
    minQty: 100,
    maxQty: 100000,
    refill: false,
    cancel: false,
    active: true,
    manual: true,
    startTime: "0-1 hour",
    avgTime: "24 hours",
    providerId: "",
    providerServiceId: "",
  });
  const [catName, setCatName] = useState("");

  const [orders, setOrders] = useState<any[]>([]);
  const [orderStatus, setOrderStatus] = useState("");

  const [payments, setPayments] = useState<any>(null);
  const [provForm, setProvForm] = useState({ name: "", baseUrl: "https://", apiKey: "" });
  const [reports, setReports] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);

  const [digItems, setDigItems] = useState<any[]>([]);
  const [digForm, setDigForm] = useState({
    name: "",
    price: 1,
    stock: 0,
    description: "",
    active: true,
    codes: "",
  });
  const [digEdit, setDigEdit] = useState<string | null>(null);

  const toast = (m: string) => setMsg(m);

  const load = useCallback(async () => {
    try {
      if (tab === "home") {
        const r = await fetch("/api/mini-admin/stats");
        const j = await r.json();
        if (r.ok) setStats(j);
      }
      if (tab === "users" || tab === "balance") {
        const r = await fetch(`/api/mini-admin/users?q=${encodeURIComponent(qUser)}`);
        const j = await r.json();
        if (r.ok) setUsers(j.users || []);
      }
      if (tab === "services") {
        const [rs, rc, rp] = await Promise.all([
          fetch("/api/mini-admin/services"),
          fetch("/api/mini-admin/categories"),
          fetch("/api/mini-admin/providers"),
        ]);
        const js = await rs.json();
        const jc = await rc.json();
        const jp = await rp.json();
        if (rs.ok) setSvcs(js.items || []);
        if (rc.ok) setCats(jc.items || []);
        if (rp.ok) setProviders(jp.items || []);
      }
      if (tab === "orders") {
        const r = await fetch(
          `/api/mini-admin/orders${orderStatus ? `?status=${orderStatus}` : ""}`
        );
        const j = await r.json();
        if (r.ok) setOrders(j.orders || []);
      }
      if (tab === "payments") {
        const r = await fetch("/api/mini-admin/payments");
        const j = await r.json();
        if (r.ok) setPayments(j);
      }
      if (tab === "providers") {
        const r = await fetch("/api/mini-admin/providers");
        const j = await r.json();
        if (r.ok) setProviders(j.items || []);
      }
      if (tab === "reports") {
        const r = await fetch("/api/mini-admin/reports");
        const j = await r.json();
        if (r.ok) setReports(j);
      }
      if (tab === "settings") {
        const r = await fetch("/api/mini-admin/settings");
        const j = await r.json();
        if (r.ok) setSettings(j);
      }
      if (tab === "digital") {
        const r = await fetch("/api/mini-admin/digital-products");
        const j = await r.json();
        if (r.ok) setDigItems(j.items || []);
      }
    } catch {
      toast("Load failed");
    }
  }, [tab, qUser, orderStatus]);

  useEffect(() => {
    setMsg("");
    load();
  }, [tab]); // eslint-disable-line

  const doAdjust = async () => {
    if (!adj) return;
    const amount = Number(adj.amount);
    if (!amount) return toast("Invalid amount");
    setBusy(true);
    try {
      const r = await fetch("/api/mini-admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust",
          userId: adj.userId,
          amount,
          direction: adj.direction,
          reason: "Mini admin balance",
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast(`OK ${money(j.balanceAfter)}`);
      setAdj(null);
      load();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const ban = async (userId: string, action: "ban" | "unban") => {
    const r = await fetch("/api/mini-admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, userId }),
    });
    const j = await r.json();
    if (!r.ok) toast(j.error || "Failed");
    else {
      toast(action === "ban" ? "Banned" : "Unbanned");
      load();
    }
  };

  const openUser = async (id: string) => {
    const r = await fetch(`/api/mini-admin/users?id=${id}`);
    const j = await r.json();
    if (r.ok) setUserDetail(j);
    else toast(j.error || "Failed");
  };

  const saveSvc = async () => {
    if (!svcForm.name || !svcForm.categoryId) return toast("Name + category required");
    setBusy(true);
    try {
      const body = {
        ...svcForm,
        providerId: svcForm.manual ? undefined : svcForm.providerId || undefined,
        providerServiceId: svcForm.manual
          ? undefined
          : svcForm.providerServiceId || undefined,
      };
      const r = await fetch("/api/mini-admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast(`Created #${j.num}`);
      setShowAddSvc(false);
      setSvcForm({
        name: "",
        description: "",
        categoryId: "",
        costPrice: 0,
        sellPrice: 1,
        minQty: 100,
        maxQty: 100000,
        refill: false,
        cancel: false,
        active: true,
        manual: true,
        startTime: "0-1 hour",
        avgTime: "24 hours",
        providerId: "",
        providerServiceId: "",
      });
      load();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleSvc = async (s: any) => {
    const r = await fetch("/api/mini-admin/services", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, active: !s.active }),
    });
    if (r.ok) {
      toast(!s.active ? "Enabled" : "Disabled");
      load();
    }
  };

  const delSvc = async (id: string) => {
    if (!confirm("Archive service?")) return;
    await fetch(`/api/mini-admin/services?id=${id}`, { method: "DELETE" });
    toast("Archived");
    load();
  };

  const addCat = async () => {
    if (!catName.trim()) return;
    const r = await fetch("/api/mini-admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: catName.trim() }),
    });
    const j = await r.json();
    if (!r.ok) toast(j.error || "Failed");
    else {
      toast("Category added");
      setCatName("");
      load();
    }
  };

  const setOrderSt = async (id: string, status: string) => {
    const r = await fetch("/api/mini-admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (r.ok) {
      toast(status);
      load();
    }
  };

  const toggleAba = async (enabled: boolean) => {
    await fetch("/api/mini-admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggle_aba", enabled }),
    });
    toast(enabled ? "ABA ON" : "ABA OFF");
    load();
  };

  const settle = async (depositId: string) => {
    const r = await fetch("/api/mini-admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "settle", depositId }),
    });
    const j = await r.json();
    toast(j.status || "done");
    load();
  };

  const addProv = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/mini-admin/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(provForm),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast("Provider added");
      setProvForm({ name: "", baseUrl: "https://", apiKey: "" });
      load();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/mini-admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!r.ok) throw new Error("Failed");
      toast("Settings saved");
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveDig = async () => {
    setBusy(true);
    try {
      const body = digEdit ? { id: digEdit, ...digForm } : digForm;
      const r = await fetch("/api/mini-admin/digital-products", {
        method: digEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast(digEdit ? "Updated" : "Created");
      setDigEdit(null);
      setDigForm({ name: "", price: 1, stock: 0, description: "", active: true, codes: "" });
      load();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="store-hero !py-3">
        <div className="flex items-center gap-3">
          <IconTile name="admin" size={24} />
          <div>
            <div className="text-[11px] font-semibold uppercase opacity-80">Mini App</div>
            <div className="text-[18px] font-bold">Admin Panel</div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[9px] font-semibold ${
              tab === t.id ? "bg-cyan/15 text-cyan" : "text-muted"
            }`}
          >
            <PremiumIcon name={t.icon} active={tab === t.id} size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className="rounded-xl bg-cyan/10 px-3 py-2 text-center text-[12px] text-cyan">
          {msg}
        </div>
      )}

      {/* HOME */}
      {tab === "home" && stats && (
        <div className="grid grid-cols-2 gap-2">
          {[
            ["Users", stats.users],
            ["Orders", stats.orders],
            ["Pending", stats.pendingOrders],
            ["Pay pending", stats.pendingPayments],
            ["Revenue", money(stats.revenue)],
            ["Profit", money(stats.profit)],
            ["Deposits", money(stats.depositsPaid)],
            ["Digital", stats.digitalProducts],
          ].map(([l, v]) => (
            <div key={String(l)} className="glass p-3">
              <div className="text-[11px] text-muted">{l}</div>
              <div className="text-[16px] font-bold tabular-nums">{v ?? "…"}</div>
            </div>
          ))}
          {stats.providers?.length > 0 && (
            <div className="glass col-span-2 p-3">
              <div className="mb-2 text-[12px] font-bold">Providers</div>
              {stats.providers.map((p: any) => (
                <div key={p.id} className="flex justify-between text-[12px] py-1">
                  <span>{p.name}</span>
                  <span className={p.enabled ? "text-emerald-500" : "text-rose-500"}>
                    {p.enabled ? "ON" : "OFF"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* USERS */}
      {(tab === "users" || tab === "balance") && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-[13px]"
              placeholder="Search user / TG id"
              value={qUser}
              onChange={(e) => setQUser(e.target.value)}
            />
            <button
              type="button"
              className="rounded-xl bg-cyan px-3 py-2 text-[12px] font-bold text-white"
              onClick={() => load()}
            >
              Go
            </button>
          </div>
          <div className="tg-section">
            {users.map((u) => (
              <div key={u.id} className="tg-cell !items-start">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => openUser(u.id)}
                >
                  <div className="font-semibold text-[13px]">{u.username}</div>
                  <div className="text-[11px] text-muted">
                    {money(u.balance)} · TG {u.telegramId || "—"} · {u.status}
                  </div>
                </button>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600"
                    onClick={() => setAdj({ userId: u.id, amount: "1", direction: "add" })}
                  >
                    +$
                  </button>
                  <button
                    type="button"
                    className="rounded bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-500"
                    onClick={() => setAdj({ userId: u.id, amount: "1", direction: "deduct" })}
                  >
                    −$
                  </button>
                  <button
                    type="button"
                    className="rounded bg-line/50 px-2 py-0.5 text-[10px] font-bold"
                    onClick={() => ban(u.id, u.status === "SUSPENDED" ? "unban" : "ban")}
                  >
                    {u.status === "SUSPENDED" ? "Unban" : "Ban"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SERVICES */}
      {tab === "services" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              className="store-primary-btn flex-1 !py-2.5 text-[13px]"
              onClick={() => setShowAddSvc(true)}
            >
              + Add Full Service
            </button>
          </div>
          <div className="glass space-y-2 p-3">
            <div className="text-[12px] font-bold">Categories (Menu 2)</div>
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-[13px]"
                placeholder="TikTok Likes – Cambodia"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
              />
              <button
                type="button"
                className="rounded-xl bg-cyan px-3 text-[12px] font-bold text-white"
                onClick={addCat}
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {cats.map((c) => (
                <span
                  key={c.id}
                  className="rounded-full bg-line/50 px-2 py-0.5 text-[11px]"
                >
                  {c.name} ({c.services})
                </span>
              ))}
            </div>
          </div>
          <div className="tg-section">
            {svcs.map((s) => (
              <div key={s.id} className="tg-cell !items-start">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">
                    #{s.num} {s.name}
                  </div>
                  <div className="text-[11px] text-muted">
                    {s.category} · {money(s.sellPrice)}/1k · {s.minQty}–{s.maxQty}
                    {s.manual ? " · Manual" : ""}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => toggleSvc(s)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      s.active ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-500"
                    }`}
                  >
                    {s.active ? "ON" : "OFF"}
                  </button>
                  <button
                    type="button"
                    className="text-[10px] font-bold text-rose-500"
                    onClick={() => delSvc(s.id)}
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showAddSvc && (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
              <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 sm:rounded-2xl">
                <div className="mb-3 flex items-center justify-between">
                  <div className="font-bold">Add Full Service</div>
                  <button type="button" onClick={() => setShowAddSvc(false)}>
                    ×
                  </button>
                </div>
                <div className="space-y-2 text-[13px]">
                  {(
                    [
                      ["name", "Service name", "text"],
                      ["description", "Description", "text"],
                      ["sellPrice", "Sell price /1k", "number"],
                      ["costPrice", "Cost price /1k", "number"],
                      ["minQty", "Min qty", "number"],
                      ["maxQty", "Max qty", "number"],
                      ["startTime", "Start time", "text"],
                      ["avgTime", "Avg delivery", "text"],
                    ] as const
                  ).map(([k, label, type]) => (
                    <label key={k} className="block">
                      <span className="text-[11px] text-muted">{label}</span>
                      <input
                        type={type}
                        className="mt-0.5 w-full rounded-xl border border-line bg-bg px-3 py-2"
                        value={(svcForm as any)[k]}
                        onChange={(e) =>
                          setSvcForm({
                            ...svcForm,
                            [k]:
                              type === "number"
                                ? Number(e.target.value)
                                : e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                  <label className="block">
                    <span className="text-[11px] text-muted">Category</span>
                    <select
                      className="mt-0.5 w-full rounded-xl border border-line bg-bg px-3 py-2"
                      value={svcForm.categoryId}
                      onChange={(e) =>
                        setSvcForm({ ...svcForm, categoryId: e.target.value })
                      }
                    >
                      <option value="">Select…</option>
                      {cats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={svcForm.manual}
                      onChange={(e) =>
                        setSvcForm({ ...svcForm, manual: e.target.checked })
                      }
                    />
                    Manual order (no provider)
                  </label>
                  {!svcForm.manual && (
                    <>
                      <select
                        className="w-full rounded-xl border border-line bg-bg px-3 py-2"
                        value={svcForm.providerId}
                        onChange={(e) =>
                          setSvcForm({ ...svcForm, providerId: e.target.value })
                        }
                      >
                        <option value="">Provider…</option>
                        {providers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        className="w-full rounded-xl border border-line bg-bg px-3 py-2"
                        placeholder="Provider service ID"
                        value={svcForm.providerServiceId}
                        onChange={(e) =>
                          setSvcForm({
                            ...svcForm,
                            providerServiceId: e.target.value,
                          })
                        }
                      />
                    </>
                  )}
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1 text-[12px]">
                      <input
                        type="checkbox"
                        checked={svcForm.refill}
                        onChange={(e) =>
                          setSvcForm({ ...svcForm, refill: e.target.checked })
                        }
                      />
                      Refill
                    </label>
                    <label className="flex items-center gap-1 text-[12px]">
                      <input
                        type="checkbox"
                        checked={svcForm.cancel}
                        onChange={(e) =>
                          setSvcForm({ ...svcForm, cancel: e.target.checked })
                        }
                      />
                      Cancel
                    </label>
                    <label className="flex items-center gap-1 text-[12px]">
                      <input
                        type="checkbox"
                        checked={svcForm.active}
                        onChange={(e) =>
                          setSvcForm({ ...svcForm, active: e.target.checked })
                        }
                      />
                      Active
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    className="store-primary-btn mt-2"
                    onClick={saveSvc}
                  >
                    {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Publish service"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ORDERS */}
      {tab === "orders" && (
        <div className="space-y-3">
          <select
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-[13px]"
            value={orderStatus}
            onChange={(e) => {
              setOrderStatus(e.target.value);
              setTimeout(load, 0);
            }}
          >
            <option value="">All statuses</option>
            {["PENDING", "PROCESSING", "IN_PROGRESS", "COMPLETED", "PARTIAL", "CANCELLED", "FAILED"].map(
              (s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              )
            )}
          </select>
          <div className="tg-section">
            {orders.map((o) => (
              <div key={o.id} className="border-b border-line/40 px-3 py-3 last:border-0">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">
                      #{o.num} {o.serviceName}
                    </div>
                    <div className="text-[11px] text-muted">
                      @{o.username} · ×{o.quantity} · {money(o.sellPrice)}
                      {o.manual ? " · Manual" : ""}
                    </div>
                    <div className="truncate text-[11px] text-muted">{o.target}</div>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold">{o.status}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {["PROCESSING", "COMPLETED", "PARTIAL", "CANCELLED", "FAILED"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      className="rounded-full bg-line/40 px-2 py-0.5 text-[10px] font-semibold"
                      onClick={() => setOrderSt(o.id, st)}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!orders.length && (
              <div className="py-8 text-center text-[13px] text-muted">No orders</div>
            )}
          </div>
        </div>
      )}

      {/* PAYMENTS */}
      {tab === "payments" && payments && (
        <div className="space-y-3">
          <div className="glass flex items-center justify-between p-4">
            <div>
              <div className="font-bold text-[14px]">ABA KHQR</div>
              <div className="text-[12px] text-muted">Payment gateway</div>
            </div>
            <button
              type="button"
              onClick={() => toggleAba(!payments.abaEnabled)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-bold ${
                payments.abaEnabled
                  ? "bg-emerald-500/15 text-emerald-600"
                  : "bg-rose-500/15 text-rose-500"
              }`}
            >
              {payments.abaEnabled ? "Enabled" : "Disabled"}
            </button>
          </div>
          <div className="tg-section">
            {payments.deposits?.map((d: any) => (
              <div key={d.id} className="tg-cell !items-start">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">
                    {money(d.amount)} · @{d.username}
                  </div>
                  <div className="text-[11px] text-muted">
                    {d.status} · {d.method}
                  </div>
                </div>
                {d.status === "PENDING" && (
                  <button
                    type="button"
                    className="text-[11px] font-bold text-cyan"
                    onClick={() => settle(d.id)}
                  >
                    Settle
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PROVIDERS */}
      {tab === "providers" && (
        <div className="space-y-3">
          <div className="glass space-y-2 p-3">
            <div className="text-[13px] font-bold">Add provider</div>
            <input
              className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-[13px]"
              placeholder="Name"
              value={provForm.name}
              onChange={(e) => setProvForm({ ...provForm, name: e.target.value })}
            />
            <input
              className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-[13px]"
              placeholder="API URL"
              value={provForm.baseUrl}
              onChange={(e) => setProvForm({ ...provForm, baseUrl: e.target.value })}
            />
            <input
              className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-[13px]"
              placeholder="API Key (stored encrypted)"
              value={provForm.apiKey}
              onChange={(e) => setProvForm({ ...provForm, apiKey: e.target.value })}
            />
            <button
              type="button"
              disabled={busy}
              className="store-primary-btn !py-2.5 text-[13px]"
              onClick={addProv}
            >
              Save provider
            </button>
          </div>
          <div className="tg-section">
            {providers.map((p) => (
              <div key={p.id} className="tg-cell">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">{p.name}</div>
                  <div className="truncate text-[11px] text-muted">{p.baseUrl}</div>
                </div>
                <button
                  type="button"
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    p.enabled ? "text-emerald-600" : "text-rose-500"
                  }`}
                  onClick={async () => {
                    await fetch("/api/mini-admin/providers", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: p.id, enabled: !p.enabled }),
                    });
                    load();
                  }}
                >
                  {p.enabled ? "ON" : "OFF"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DIGITAL - compact */}
      {tab === "digital" && <DigitalStoreAdminView />}

      {/* REPORTS */}
      {tab === "reports" && reports && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="glass p-3 text-center">
              <div className="text-[10px] text-muted">Revenue</div>
              <div className="text-[14px] font-bold">{money(reports.totalRevenue)}</div>
            </div>
            <div className="glass p-3 text-center">
              <div className="text-[10px] text-muted">Cost</div>
              <div className="text-[14px] font-bold">{money(reports.totalCost)}</div>
            </div>
            <div className="glass p-3 text-center">
              <div className="text-[10px] text-muted">Profit</div>
              <div className="text-[14px] font-bold text-emerald-500">
                {money(reports.totalProfit)}
              </div>
            </div>
          </div>
          <div className="tg-section">
            {reports.days?.slice(0, 14).map((d: any) => (
              <div key={d.date} className="tg-cell text-[12px]">
                <span className="font-mono">{d.date}</span>
                <span className="ml-auto tabular-nums">
                  {money(d.revenue)} / {money(d.profit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SETTINGS */}
      {tab === "settings" && settings && (
        <div className="glass space-y-2 p-4">
          {(["siteName", "description"] as const).map((k) => (
            <label key={k} className="block text-[12px]">
              <span className="text-muted">{k}</span>
              <input
                className="mt-0.5 w-full rounded-xl border border-line bg-bg px-3 py-2 text-[13px]"
                value={settings[k] ?? ""}
                onChange={(e) => setSettings({ ...settings, [k]: e.target.value })}
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={!!settings.maintenance}
              onChange={(e) =>
                setSettings({ ...settings, maintenance: e.target.checked })
              }
            />
            Maintenance mode
          </label>
          <button
            type="button"
            disabled={busy}
            className="store-primary-btn !py-2.5 text-[13px]"
            onClick={saveSettings}
          >
            Save settings
          </button>
        </div>
      )}

      {/* Balance adjust modal */}
      {adj && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-surface p-4 sm:rounded-2xl">
            <div className="mb-3 font-bold">
              {adj.direction === "add" ? "Add balance" : "Deduct balance"}
            </div>
            <input
              type="number"
              className="mb-3 w-full rounded-xl border border-line bg-bg px-3 py-2.5"
              value={adj.amount}
              onChange={(e) => setAdj({ ...adj, amount: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-xl border border-line py-3 font-semibold"
                onClick={() => setAdj(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                className="store-primary-btn !py-3"
                onClick={doAdjust}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User detail */}
      {userDetail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 sm:rounded-2xl">
            <div className="mb-2 flex justify-between">
              <div className="font-bold">{userDetail.user?.username}</div>
              <button type="button" onClick={() => setUserDetail(null)}>
                ×
              </button>
            </div>
            <div className="text-[12px] text-muted mb-3">
              Balance {money(userDetail.user?.balance)} · TG{" "}
              {userDetail.user?.telegramId || "—"}
            </div>
            <div className="text-[12px] font-bold mb-1">Orders</div>
            {userDetail.orders?.slice(0, 8).map((o: any) => (
              <div key={o.id} className="text-[11px] py-1 border-b border-line/30">
                {o.serviceName} · {money(o.sellPrice)} · {o.status}
              </div>
            ))}
            <div className="text-[12px] font-bold mb-1 mt-3">Transactions</div>
            {userDetail.transactions?.slice(0, 8).map((t: any) => (
              <div key={t.id} className="text-[11px] py-1 border-b border-line/30">
                {t.type} {money(t.amount)} → {money(t.balanceAfter)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
