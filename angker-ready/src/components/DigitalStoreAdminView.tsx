"use client";
import { useCallback, useEffect, useState } from "react";
import { IconTile, PremiumIcon } from "./PremiumIcon";
import { money } from "@/lib/format";
import { Loader2 } from "lucide-react";

type DTab =
  | "dash"
  | "cats"
  | "products"
  | "inventory"
  | "suppliers"
  | "orders"
  | "reports"
  | "settings";

const TABS: { id: DTab; label: string }[] = [
  { id: "dash", label: "Dash" },
  { id: "cats", label: "Cats" },
  { id: "products", label: "Products" },
  { id: "inventory", label: "Stock" },
  { id: "suppliers", label: "Supply" },
  { id: "orders", label: "Orders" },
  { id: "reports", label: "Report" },
  { id: "settings", label: "Set" },
];

export function DigitalStoreAdminView() {
  const [tab, setTab] = useState<DTab>("dash");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [catName, setCatName] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderFilter, setOrderFilter] = useState("");
  const [showProduct, setShowProduct] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    price: 1,
    costPrice: 0,
    stock: 0,
    description: "",
    features: "",
    imageUrl: "",
    delivery: "Instant",
    deliveryMode: "auto" as "auto" | "manual",
    active: true,
    categoryId: "",
    supplierId: "",
    codes: "",
  });
  const [supForm, setSupForm] = useState({ name: "", apiUrl: "", apiKey: "", note: "" });
  const [deliver, setDeliver] = useState<{ id: string; payload: string } | null>(null);

  const toast = (m: string) => setMsg(m);

  const load = useCallback(async () => {
    try {
      if (tab === "dash" || tab === "reports") {
        const r = await fetch("/api/mini-admin/digital/stats");
        if (r.ok) setStats(await r.json());
      }
      if (tab === "cats" || tab === "products") {
        const r = await fetch("/api/mini-admin/digital/categories");
        if (r.ok) setCats((await r.json()).items || []);
      }
      if (tab === "products" || tab === "inventory") {
        const r = await fetch("/api/mini-admin/digital/products");
        if (r.ok) setProducts((await r.json()).items || []);
      }
      if (tab === "suppliers" || tab === "products") {
        const r = await fetch("/api/mini-admin/digital/suppliers");
        if (r.ok) setSuppliers((await r.json()).items || []);
      }
      if (tab === "orders") {
        const r = await fetch(
          `/api/mini-admin/digital/orders${orderFilter ? `?status=${orderFilter}` : ""}`
        );
        if (r.ok) setOrders((await r.json()).orders || []);
      }
    } catch {
      toast("Load failed");
    }
  }, [tab, orderFilter]);

  useEffect(() => {
    setMsg("");
    load();
  }, [tab]); // eslint-disable-line

  const saveCat = async () => {
    if (!catName.trim()) return;
    const r = await fetch("/api/mini-admin/digital/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: catName.trim() }),
    });
    if (r.ok) {
      toast("Category created");
      setCatName("");
      load();
    } else toast("Failed");
  };

  const delCat = async (id: string) => {
    if (!confirm("Delete category?")) return;
    await fetch(`/api/mini-admin/digital/categories?id=${id}`, { method: "DELETE" });
    load();
  };

  const saveProduct = async () => {
    if (!form.name) return toast("Name required");
    setBusy(true);
    try {
      const body = editId ? { id: editId, ...form } : form;
      const r = await fetch("/api/mini-admin/digital/products", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      toast(editId ? "Updated" : "Product published");
      setShowProduct(false);
      setEditId(null);
      load();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleProduct = async (p: any) => {
    await fetch("/api/mini-admin/digital/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    load();
  };

  const delProduct = async (id: string) => {
    if (!confirm("Delete product?")) return;
    await fetch(`/api/mini-admin/digital/products?id=${id}`, { method: "DELETE" });
    load();
  };

  const addCodes = async (id: string, codes: string) => {
    await fetch("/api/mini-admin/digital/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, codes }),
    });
    toast("Stock updated");
    load();
  };

  const saveSup = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/mini-admin/digital/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(supForm),
      });
      if (!r.ok) throw new Error("Failed");
      toast("Supplier added");
      setSupForm({ name: "", apiUrl: "", apiKey: "", note: "" });
      load();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setOrder = async (id: string, data: any) => {
    const r = await fetch("/api/mini-admin/digital/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    const j = await r.json();
    if (!r.ok) toast(j.error || "Failed");
    else {
      toast(data.action === "refund" ? "Refunded" : data.status || "Updated");
      setDeliver(null);
      load();
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-4 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <IconTile name="digital" size={24} className="!bg-white/20 !text-white !ring-white/30" />
          <div>
            <div className="text-[11px] font-semibold uppercase opacity-90">Digital Store</div>
            <div className="text-[18px] font-bold">Admin Panel</div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-xl px-2.5 py-1.5 text-[10px] font-bold ${
              tab === t.id ? "bg-violet-500/20 text-violet-600 dark:text-violet-300" : "text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className="rounded-xl bg-violet-500/10 px-3 py-2 text-center text-[12px] text-violet-600">
          {msg}
        </div>
      )}

      {tab === "dash" && stats && (
        <div className="grid grid-cols-2 gap-2">
          {[
            ["Products", stats.products],
            ["Active", stats.activeProducts],
            ["Orders", stats.orders],
            ["Pending", stats.pendingOrders],
            ["Revenue", money(stats.revenue)],
            ["Profit", money(stats.profit)],
          ].map(([l, v]) => (
            <div key={String(l)} className="glass p-3">
              <div className="text-[11px] text-muted">{l}</div>
              <div className="text-[16px] font-bold tabular-nums">{v}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "cats" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-[13px]"
              placeholder="Category name"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
            />
            <button type="button" className="rounded-xl bg-violet-600 px-3 text-[12px] font-bold text-white" onClick={saveCat}>
              Add
            </button>
          </div>
          <div className="tg-section">
            {cats.map((c) => (
              <div key={c.id} className="tg-cell">
                <div className="flex-1 text-[13px] font-semibold">
                  {c.name} <span className="text-muted font-normal">({c.products})</span>
                </div>
                <button type="button" className="text-[11px] text-rose-500 font-bold" onClick={() => delCat(c.id)}>
                  Del
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(tab === "products" || tab === "inventory") && (
        <div className="space-y-3">
          {tab === "products" && (
            <button
              type="button"
              className="store-primary-btn !bg-gradient-to-r !from-violet-600 !to-fuchsia-600"
              onClick={() => {
                setEditId(null);
                setShowProduct(true);
              }}
            >
              + Add Full Product
            </button>
          )}
          <div className="tg-section">
            {products.map((p) => (
              <div key={p.id} className="border-b border-line/40 px-3 py-3 last:border-0">
                <div className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold truncate">{p.name}</div>
                    <div className="text-[11px] text-muted">
                      Sell {money(p.price)} · Cost {money(p.costPrice)} · Stock {p.stock}
                      {p.deliveryMode === "manual" ? " · Manual" : " · Auto"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {tab === "products" && (
                      <>
                        <button
                          type="button"
                          className={`text-[10px] font-bold ${p.active ? "text-emerald-600" : "text-rose-500"}`}
                          onClick={() => toggleProduct(p)}
                        >
                          {p.active ? "ON" : "OFF"}
                        </button>
                        <button
                          type="button"
                          className="text-[10px] font-bold text-cyan"
                          onClick={() => {
                            setEditId(p.id);
                            setForm({
                              name: p.name,
                              price: p.price,
                              costPrice: p.costPrice,
                              stock: p.stock,
                              description: p.description || "",
                              features: p.features || "",
                              imageUrl: p.imageUrl || "",
                              delivery: p.delivery,
                              deliveryMode: p.deliveryMode || "auto",
                              active: p.active,
                              categoryId: p.categoryId || "",
                              supplierId: p.supplierId || "",
                              codes: "",
                            });
                            setShowProduct(true);
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className="text-[10px] font-bold text-rose-500" onClick={() => delProduct(p.id)}>
                          Del
                        </button>
                      </>
                    )}
                    {tab === "inventory" && (
                      <button
                        type="button"
                        className="text-[10px] font-bold text-violet-600"
                        onClick={() => {
                          const codes = prompt("Paste codes (one per line)");
                          if (codes) addCodes(p.id, codes);
                        }}
                      >
                        + Keys
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "suppliers" && (
        <div className="space-y-3">
          <div className="glass space-y-2 p-3">
            <input className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-[13px]" placeholder="Supplier name" value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} />
            <input className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-[13px]" placeholder="API URL (optional)" value={supForm.apiUrl} onChange={(e) => setSupForm({ ...supForm, apiUrl: e.target.value })} />
            <input className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-[13px]" placeholder="API Key (encrypted)" value={supForm.apiKey} onChange={(e) => setSupForm({ ...supForm, apiKey: e.target.value })} />
            <button type="button" disabled={busy} className="store-primary-btn !py-2 text-[13px] !from-violet-600 !to-fuchsia-600 bg-gradient-to-r" onClick={saveSup}>
              Add supplier
            </button>
          </div>
          <div className="tg-section">
            {suppliers.map((s) => (
              <div key={s.id} className="tg-cell">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold">{s.name}</div>
                  <div className="text-[11px] text-muted truncate">{s.apiUrl || "No API"} · {s.products} products</div>
                </div>
                <span className={s.enabled ? "text-emerald-600 text-[10px] font-bold" : "text-rose-500 text-[10px] font-bold"}>
                  {s.enabled ? "ON" : "OFF"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-3">
          <select
            className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-[13px]"
            value={orderFilter}
            onChange={(e) => {
              setOrderFilter(e.target.value);
              setTimeout(load, 50);
            }}
          >
            <option value="">All</option>
            {["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="tg-section">
            {orders.map((o) => (
              <div key={o.id} className="border-b border-line/40 px-3 py-3 last:border-0">
                <div className="flex justify-between">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold truncate">{o.productName}</div>
                    <div className="text-[11px] text-muted">
                      @{o.username} · ×{o.quantity} · {money(o.totalPrice)} · {o.deliveryMode}
                    </div>
                    {o.deliveryPayload && (
                      <div className="mt-1 rounded bg-bg px-2 py-1 font-mono text-[10px] break-all">
                        {o.deliveryPayload}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold">{o.status}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {["PROCESSING", "COMPLETED", "FAILED", "CANCELLED"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      className="rounded-full bg-line/40 px-2 py-0.5 text-[10px] font-semibold"
                      onClick={() => setOrder(o.id, { status: st })}
                    >
                      {st}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-600"
                    onClick={() =>
                      setDeliver({ id: o.id, payload: o.deliveryPayload || "" })
                    }
                  >
                    Deliver
                  </button>
                  {!o.refunded && (
                    <button
                      type="button"
                      className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-500"
                      onClick={() => {
                        if (confirm("Refund to wallet?"))
                          setOrder(o.id, { action: "refund" });
                      }}
                    >
                      Refund
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "reports" && stats && (
        <div className="grid grid-cols-2 gap-2">
          <div className="glass p-4 col-span-2">
            <div className="text-[12px] text-muted">Digital revenue</div>
            <div className="text-[24px] font-bold text-violet-600">{money(stats.revenue)}</div>
            <div className="text-[13px] text-muted mt-1">
              Cost {money(stats.cost)} · Profit{" "}
              <span className="text-emerald-500 font-bold">{money(stats.profit)}</span>
            </div>
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="glass p-4 text-[13px] text-muted space-y-2">
          <p>Digital Store shares <b className="text-fg">Users, Wallet, ABA KHQR</b> with SMM.</p>
          <p>Auto delivery uses inventory keys. Manual = admin Deliver button.</p>
          <p>Promotions: use existing Coupon system in web admin / order flow.</p>
        </div>
      )}

      {showProduct && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-4 sm:rounded-2xl">
            <div className="mb-3 flex justify-between font-bold">
              {editId ? "Edit product" : "Add Full Product"}
              <button type="button" onClick={() => setShowProduct(false)}>×</button>
            </div>
            <div className="space-y-2 text-[13px]">
              <input className="w-full rounded-xl border border-line bg-bg px-3 py-2" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" className="rounded-xl border border-line bg-bg px-3 py-2" placeholder="Sell price" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} />
                <input type="number" className="rounded-xl border border-line bg-bg px-3 py-2" placeholder="Cost price" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} />
              </div>
              <input className="w-full rounded-xl border border-line bg-bg px-3 py-2" placeholder="Image URL" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
              <textarea className="w-full rounded-xl border border-line bg-bg px-3 py-2" rows={2} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <textarea className="w-full rounded-xl border border-line bg-bg px-3 py-2" rows={2} placeholder="Features (one per line)" value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
              <select className="w-full rounded-xl border border-line bg-bg px-3 py-2" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Category…</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select className="w-full rounded-xl border border-line bg-bg px-3 py-2" value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">Supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select className="w-full rounded-xl border border-line bg-bg px-3 py-2" value={form.deliveryMode} onChange={(e) => setForm({ ...form, deliveryMode: e.target.value as any })}>
                <option value="auto">Auto delivery (keys)</option>
                <option value="manual">Manual delivery</option>
              </select>
              <textarea className="w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-[11px]" rows={3} placeholder="License keys / codes (one per line)" value={form.codes} onChange={(e) => setForm({ ...form, codes: e.target.value })} />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Active / Enable
              </label>
              <button type="button" disabled={busy} className="store-primary-btn bg-gradient-to-r from-violet-600 to-fuchsia-600" onClick={saveProduct}>
                {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Publish"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deliver && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-2xl bg-surface p-4 sm:rounded-2xl">
            <div className="mb-2 font-bold">Manual delivery</div>
            <textarea
              className="mb-3 w-full rounded-xl border border-line bg-bg px-3 py-2 font-mono text-[12px]"
              rows={4}
              placeholder="Paste license / account / download link"
              value={deliver.payload}
              onChange={(e) => setDeliver({ ...deliver, payload: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="rounded-xl border border-line py-3 font-semibold" onClick={() => setDeliver(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="store-primary-btn !py-3"
                onClick={() =>
                  setOrder(deliver.id, {
                    deliveryPayload: deliver.payload,
                    status: "COMPLETED",
                  })
                }
              >
                Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
