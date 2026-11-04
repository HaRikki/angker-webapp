"use client";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlarmClock, Box, ChevronDown, ChevronUp, Gauge, LayoutGrid, Link2,
  Loader2, RefreshCw, Search, ShoppingCart, Star, Truck,
} from "lucide-react";
import { useApi } from "@/lib/useApi";
import { money } from "@/lib/format";
import { useI18n, useToast } from "./Providers";
import { ErrorBox } from "./kit";
import type { Svc, Cat } from "./ServicesView";

type SvcX = Svc & { startTime?: string; avgTime?: string; category?: { id: string; name: string } };
type PlatId = "all" | "tiktok" | "facebook" | "fblive" | "youtube" | "telegram";

const PLATS: { id: PlatId; label: string }[] = [
  { id: "all", label: "Everythings" },
  { id: "tiktok", label: "TikTok" },
  { id: "facebook", label: "Facebook" },
  { id: "fblive", label: "Facebook Live" },
  { id: "youtube", label: "YouTube" },
  { id: "telegram", label: "Telegram" },
];

function platOf(name: string): PlatId {
  const n = name.toLowerCase();
  if (n.includes("tiktok") || n.includes("tik tok")) return "tiktok";
  if (n.includes("facebook") || /\bfb\b/.test(n)) return /live/.test(n) ? "fblive" : "facebook";
  if (n.includes("youtube") || /\byt\b/.test(n)) return "youtube";
  if (n.includes("telegram") || /\btg\b/.test(n)) return "telegram";
  return "all";
}

/** Small coloured app tile, drawn inline (no external images). */
function PIcon({ id, size = 26 }: { id: PlatId; size?: number }) {
  const bg: Record<PlatId, string> = {
    all: "#6cb4ff", tiktok: "#111", facebook: "#2d5fd0", fblive: "#2d5fd0", youtube: "#e5322d", telegram: "#4aa3e0",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="shrink-0">
      <rect x="1" y="1" width="26" height="26" rx="6" fill={bg[id]} />
      {id === "all" && (
        <g stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
          <path d="M11 9h9M11 14h9M11 19h9" /><path d="M7 9h1M7 14h1M7 19h1" />
        </g>
      )}
      {id === "tiktok" && (
        <path fill="#fff" d="M17.6 7.6a3.6 3.6 0 0 1-.9-2.3h-2.6v10.4a2.2 2.2 0 1 1-2.2-2.2c.2 0 .4 0 .6.1V10.9a4.8 4.8 0 1 0 4.1 4.8v-5.1a6.1 6.1 0 0 0 3.5 1.1V9a3.6 3.6 0 0 1-2.5-1.4z" />
      )}
      {(id === "facebook" || id === "fblive") && (
        <path fill="#fff" d="M15 23v-8h2.7l.4-3.1H15v-2c0-.9.3-1.5 1.6-1.5h1.7V5.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4.1v2.3H9.2V15h2.7v8z" />
      )}
      {id === "fblive" && <circle cx="22" cy="22" r="5" fill="#ef3b2d" />}
      {id === "youtube" && <path fill="#fff" d="M11 8.5v11l9-5.5z" />}
      {id === "telegram" && <path fill="#fff" d="M5.5 13.6 21.8 7c.8-.3 1.4.2 1.2 1.3l-2.8 13c-.2.9-.8 1.1-1.5.7l-4.2-3.1-2 2c-.2.2-.4.4-.9.4l.3-4.3 7.8-7c.3-.3-.1-.5-.5-.2l-9.7 6.1-4.1-1.3c-.9-.3-.9-.9.2-1.3z" />}
    </svg>
  );
}

function Dropdown({
  open, setOpen, head, children, disabled,
}: { open: boolean; setOpen: (v: boolean) => void; head: ReactNode; children: ReactNode; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", f);
    document.addEventListener("touchstart", f);
    return () => {
      document.removeEventListener("mousedown", f);
      document.removeEventListener("touchstart", f);
    };
  }, [open, setOpen]);
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} className="so-field" onClick={() => setOpen(!open)}>
        <span className="so-head">{head}</span>
        {open ? <ChevronUp size={16} className="shrink-0 opacity-50" /> : <ChevronDown size={16} className="shrink-0 opacity-50" />}
      </button>
      {open && <div className="so-list so-sel">{children}</div>}
    </div>
  );
}

const Label = ({ children, icon }: { children: ReactNode; icon?: ReactNode }) => (
  <div className="so-label">{icon}{children}</div>
);

export function NewOrderView() {
  const { lang } = useI18n() as { lang: string };
  const km = lang === "km";
  const { push: toast } = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const preService = sp.get("service") || "";

  const [mode, setMode] = useState<"new" | "mass">("new");
  const [plat, setPlat] = useState<PlatId>("all");
  const [catId, setCatId] = useState("");
  const [svc, setSvc] = useState<SvcX | null>(null);
  const [target, setTarget] = useState("");
  const [qty, setQty] = useState("");
  const [catOpen, setCatOpen] = useState(false);
  const [svcOpen, setSvcOpen] = useState(false);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [idq, setIdq] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mass, setMass] = useState("");
  const [massRes, setMassRes] = useState<{ line: string; ok: boolean; msg: string }[]>([]);
  const prefilled = useRef(false);

  useEffect(() => {
    const x = setTimeout(() => setDq(q.trim()), 300);
    return () => clearTimeout(x);
  }, [q]);

  const cats = useApi<{ categories: Cat[] }>("/api/public/categories");
  const list = useApi<{ services: SvcX[] }>(
    catId ? `/api/public/services?page=1&pageSize=200&categoryId=${catId}&sort=price_asc` : null
  );
  const found = useApi<{ services: SvcX[] }>(
    dq.length >= 2
      ? `/api/public/services?page=1&pageSize=8&${/^\d+$/.test(dq) ? `num=${dq}` : `q=${encodeURIComponent(dq)}`}`
      : null
  );
  const pre = useApi<{ services: SvcX[] }>(preService ? `/api/public/services?id=${preService}` : null);
  const dash = useApi<{ balance: string }>("/api/user/dashboard");

  const allCats = cats.data?.categories || [];
  const catsForPlat = useMemo(
    () => allCats.filter((c) => plat === "all" || platOf(c.name) === plat),
    [allCats, plat]
  );
  const cat = allCats.find((c) => c.id === catId) || null;
  const services = (list.data?.services || []).filter((s) => s.categoryId === catId);

  // keep a valid category for the chosen platform (first one by default)
  useEffect(() => {
    if (!cats.data) return;
    if (catsForPlat.length === 0) {
      if (catId) setCatId("");
      setSvc(null);
      return;
    }
    if (!catsForPlat.some((c) => c.id === catId)) setCatId(catsForPlat[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catsForPlat, cats.data]);

  // keep a valid service for the chosen category (first one by default)
  useEffect(() => {
    if (!catId || !list.data) return;
    if (svc && svc.categoryId === catId) return;
    const f = services[0] || null;
    setSvc(f);
    setQty(f ? String(f.minQty) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, catId]);

  const pick = (s: SvcX) => {
    const c = allCats.find((x) => x.id === s.categoryId);
    setCatId(s.categoryId);
    setPlat(c ? platOf(c.name) : "all");
    setSvc(s);
    setQty(String(s.minQty));
    setErr("");
  };

  // ?service=<id> prefill (from the Services page)
  useEffect(() => {
    if (prefilled.current) return;
    const s = pre.data?.services?.[0];
    if (s && cats.data) {
      prefilled.current = true;
      pick(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pre.data, cats.data]);

  const n = Number(qty) || 0;
  const qtyOk = !!svc && Number.isInteger(n) && n >= svc.minQty && n <= svc.maxQty;
  const charge = svc && qtyOk ? (Number(svc.sellPrice) * n) / 1000 : 0;
  const balance = Number(dash.data?.balance ?? 0);
  const enough = charge <= balance;

  const newKey = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ord-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const submit = async () => {
    if (!svc || !qtyOk || !target.trim()) return;
    if (!enough) return setErr(km ? "សមតុល្យមិនគ្រប់" : "Insufficient balance");
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/user/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: svc.id, target: target.trim(), quantity: n, idempotencyKey: newKey() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(String(j.error || j.message || "FAILED"));
      toast(km ? "បញ្ជាទិញជោគជ័យ" : "Order placed", "ok");
      const id = j.order?.id || j.id;
      router.push(id ? `/orders/${id}` : "/orders");
    } catch {
      setErr(km ? "បរាជ័យ" : "Failed");
    } finally {
      setBusy(false);
    }
  };

  // Mass order — one per line:  ServiceID | Quantity | Link
  const submitMass = async () => {
    const lines = mass.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setBusy(true);
    setMassRes([]);
    const out: { line: string; ok: boolean; msg: string }[] = [];
    const cache = new Map<string, SvcX | null>();
    for (const line of lines) {
      const [num, quantity, ...rest] = line.split("|").map((x) => x.trim());
      const link = rest.join("|");
      if (!num || !quantity || !link) {
        out.push({ line, ok: false, msg: "ServiceID | Quantity | Link" });
        continue;
      }
      try {
        if (!cache.has(num)) {
          const r = await fetch(`/api/public/services?num=${encodeURIComponent(num)}&pageSize=1`);
          const j = await r.json().catch(() => ({}));
          cache.set(num, j.services?.[0] || null);
        }
        const s = cache.get(num);
        const qn = Number(quantity);
        if (!s) { out.push({ line, ok: false, msg: km ? "រកមិនឃើញសេវា" : "Service not found" }); continue; }
        if (!Number.isInteger(qn) || qn < s.minQty || qn > s.maxQty) {
          out.push({ line, ok: false, msg: `Min ${s.minQty} — Max ${s.maxQty}` });
          continue;
        }
        const r = await fetch("/api/user/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceId: s.id, target: link, quantity: qn, idempotencyKey: newKey() }),
        });
        const j = await r.json().catch(() => ({}));
        out.push(r.ok
          ? { line, ok: true, msg: `#${j.order?.id ?? ""}`.trim() }
          : { line, ok: false, msg: String(j.error || j.message || "FAILED") });
      } catch {
        out.push({ line, ok: false, msg: km ? "បរាជ័យ" : "Failed" });
      }
    }
    setMassRes(out);
    setBusy(false);
    const ok = out.filter((o) => o.ok).length;
    if (ok) {
      toast(km ? `បញ្ជាទិញជោគជ័យ ${ok}` : `${ok} order(s) placed`, "ok");
      dash.reload();
    }
  };

  const searchById = async () => {
    const v = idq.trim();
    if (!/^\d+$/.test(v)) return;
    const r = await fetch(`/api/public/services?num=${v}&pageSize=1`);
    const j = await r.json().catch(() => ({}));
    if (j.services?.[0]) pick(j.services[0]);
    else toast(km ? "រកមិនឃើញសេវា" : "Service not found", "err");
  };

  if (cats.error) return <ErrorBox onRetry={cats.reload} />;

  const catHead = cat ? (
    <>
      <PIcon id={platOf(cat.name)} size={32} />
      <span className="t">{cat.name}</span>
    </>
  ) : (
    <span className="t" style={{ color: "var(--so-sub)" }}>{cats.loading ? "…" : "—"}</span>
  );
  const svcHead = svc ? (
    <>
      <span className="so-badge">{svc.num}</span>
      <span className="t">- {svc.name}</span>
    </>
  ) : (
    <span className="t" style={{ color: "var(--so-sub)" }}>{list.loading ? "…" : "—"}</span>
  );

  return (
    <div className="so mx-auto w-full max-w-lg space-y-5 pb-6">
      {/* Platform buttons */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        {PLATS.map((p) => (
          <button key={p.id} type="button" className="so-chip" data-on={plat === p.id} onClick={() => { setPlat(p.id); setCatOpen(false); setSvcOpen(false); }}>
            <PIcon id={p.id} />
            {p.label}
          </button>
        ))}
      </div>

      {/* Order card */}
      <div className="so-card">
        <div className="so-tabs">
          <button type="button" className="so-tab" data-on={mode === "new"} onClick={() => setMode("new")}>
            <ShoppingCart size={20} /> {km ? "បញ្ជាទិញថ្មី" : "New Order"}
          </button>
          <button type="button" className="so-tab" data-on={mode === "mass"} onClick={() => setMode("mass")}>
            <Star size={20} fill="currentColor" /> {km ? "បញ្ជាទិញច្រើន" : "Mass order"}
          </button>
        </div>

        {mode === "new" ? (
          <>
            <div className="relative mt-5">
              <div className="so-field" style={{ minHeight: 58 }}>
                <Search size={22} color="var(--so-blue)" strokeWidth={3} className="shrink-0" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={km ? "ស្វែងរក" : "Search"}
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--so-sub)]"
                />
              </div>
              {dq.length >= 2 && (
                <div className="so-list so-sel">
                  {found.loading && !found.data ? (
                    <div className="p-4 text-center"><Loader2 className="mx-auto animate-spin" size={18} /></div>
                  ) : (found.data?.services || []).length === 0 ? (
                    <div className="p-4 text-center text-[15px]" style={{ color: "var(--so-sub)" }}>
                      {km ? "រកមិនឃើញ" : "No results"}
                    </div>
                  ) : (
                    (found.data?.services || []).map((s) => (
                      <button key={s.id} type="button" className="so-opt" onClick={() => { pick(s); setQ(""); setDq(""); }}>
                        <span className="so-badge">{s.num}</span>
                        <span>{s.name} - {money(s.sellPrice)} / 1000</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <Label icon={<LayoutGrid size={24} color="#3b82f6" />}>{km ? "ប្រភេទ" : "Category"}</Label>
            <Dropdown open={catOpen} setOpen={(v) => { setCatOpen(v); if (v) setSvcOpen(false); }} head={catHead}>
              {catsForPlat.length === 0 ? (
                <div className="p-4 text-center text-[15px]" style={{ color: "var(--so-sub)" }}>
                  {km ? "មិនមានប្រភេទសម្រាប់វេទិកានេះ" : "No categories for this platform"}
                </div>
              ) : (
                catsForPlat.map((c) => (
                  <button key={c.id} type="button" className="so-opt" data-on={c.id === catId}
                    onClick={() => { setCatId(c.id); setSvc(null); setCatOpen(false); setErr(""); }}>
                    <PIcon id={platOf(c.name)} size={30} />
                    <span>{c.name}</span>
                  </button>
                ))
              )}
            </Dropdown>

            <Label icon={<Box size={24} color="#3b82f6" />}>{km ? "សេវា" : "Service"}</Label>
            <Dropdown open={svcOpen} setOpen={(v) => { setSvcOpen(v); if (v) setCatOpen(false); }} head={svcHead} disabled={!catId}>
              {services.length === 0 ? (
                <div className="p-4 text-center text-[15px]" style={{ color: "var(--so-sub)" }}>
                  {list.loading ? "…" : km ? "គ្មានសេវាក្នុងប្រភេទនេះ" : "No services in this category"}
                </div>
              ) : (
                services.map((s) => (
                  <button key={s.id} type="button" className="so-opt" data-on={svc?.id === s.id}
                    onClick={() => { setSvc(s); setQty(String(s.minQty)); setSvcOpen(false); setErr(""); }}>
                    <span style={{ lineHeight: 1.7 }}>
                      <span className="so-badge">{s.num}</span> - {s.name} - {money(s.sellPrice)} per 1000
                    </span>
                  </button>
                ))
              )}
            </Dropdown>

            <Label>{km ? "តំណភ្ជាប់" : "Link"}</Label>
            <input className="so-field" value={target} onChange={(e) => setTarget(e.target.value)}
              maxLength={300} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="https://… / @username" />

            <Label>{km ? "បរិមាណ" : "Quantity"}</Label>
            <input className="so-field" inputMode="numeric" value={qty} disabled={!svc}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
            {svc && (
              <p className="mt-2 text-[14px]" style={{ color: qty && !qtyOk ? "#ef4444" : "var(--so-sub)" }}>
                Min {svc.minQty.toLocaleString()} — Max {svc.maxQty.toLocaleString()}
              </p>
            )}

            <Label icon={null}>
              {km ? "ពេលវេលាមធ្យម" : "Average time"}
              <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-black text-[13px] font-bold text-white dark:bg-white dark:text-black">!</span>
            </Label>
            <div className="so-field" aria-readonly>{svc?.avgTime || ""}</div>

            <Label>{km ? "ថ្លៃសរុប" : "Charge"}</Label>
            <div className="so-field" aria-readonly>{qtyOk ? money(charge) : ""}</div>

            {err && <p className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-center text-[14px] font-medium text-rose-500">{err}</p>}
            {!enough && qtyOk && (
              <p className="mt-3 text-center text-[14px] text-rose-500">
                {km ? "សមតុល្យមិនគ្រប់ — " : "Insufficient balance — "}
                <a href="/add-funds" className="font-bold underline">{km ? "បញ្ចូលទឹកប្រាក់" : "Add funds"}</a>
              </p>
            )}

            <button type="button" className="so-submit" disabled={busy || !svc || !qtyOk || !target.trim() || !enough} onClick={submit}>
              {busy && <Loader2 className="animate-spin" size={20} />}
              {km ? "បញ្ជូន" : "Submit"}
            </button>
          </>
        ) : (
          <>
            <Label>{km ? "មួយបន្ទាត់មួយបញ្ជាទិញ" : "One order per line"}</Label>
            <textarea
              className="so-field" style={{ minHeight: 190, alignItems: "flex-start", fontSize: 16 }}
              value={mass} onChange={(e) => setMass(e.target.value)} spellCheck={false}
              placeholder={"ServiceID | Quantity | Link\n19042 | 500 | https://…"}
            />
            <p className="mt-2 text-[14px]" style={{ color: "var(--so-sub)" }}>ServiceID | Quantity | Link</p>
            {massRes.length > 0 && (
              <ul className="mt-4 space-y-1.5 text-[14px]">
                {massRes.map((r, i) => (
                  <li key={i} className="rounded-xl px-3 py-2" style={{ background: r.ok ? "rgb(16 185 129 / .12)" : "rgb(239 68 68 / .12)", color: r.ok ? "#059669" : "#ef4444" }}>
                    <div className="break-all font-medium">{r.line}</div>
                    <div>{r.ok ? "✓ " : "✕ "}{r.msg}</div>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="so-submit" disabled={busy || !mass.trim()} onClick={submitMass}>
              {busy && <Loader2 className="animate-spin" size={20} />}
              {km ? "បញ្ជូន" : "Submit"}
            </button>
          </>
        )}
      </div>

      {/* Service details card */}
      <div className="so-card">
        <div className="so-tabs">
          <div className="so-tab" data-on="true" style={{ fontSize: 16 }}>
            <span className="grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-white text-[12px] font-bold">?</span>
            {km ? "ព័ត៌មានសេវា" : "Service details"}
          </div>
          <div className="flex overflow-hidden rounded-xl" style={{ background: "#e0dfee" }}>
            <input
              value={idq} onChange={(e) => setIdq(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && searchById()}
              inputMode="numeric" placeholder={km ? "ស្វែងរក ID" : "Search For"}
              className="min-w-0 flex-1 bg-transparent px-3 text-[16px] text-slate-700 outline-none placeholder:text-slate-500"
            />
            <button type="button" aria-label="search" onClick={searchById} className="grid w-[54px] place-items-center text-white" style={{ background: "var(--so-blue)" }}>
              <Search size={22} strokeWidth={3} />
            </button>
          </div>
        </div>

        <Detail title={km ? "តំណឧទាហរណ៍" : "Example Link"} color="#ef3b5d" icon={<Link2 size={20} />} text="-" />
        <Detail title={km ? "ពេលចាប់ផ្តើម" : "Start Time"} color="#3b9cff" icon={<Gauge size={20} />} text={svc?.startTime || "-"} />
        <Detail title={km ? "ល្បឿន" : "Speed"} color="#a24be0" icon={<Truck size={20} />} text="-" />
        <Detail title={km ? "ការធានា" : "Guarantee"} color="#5ccb3a" icon={<RefreshCw size={20} />} text={svc?.refill ? "Refill" : "-"} />
        <Detail title={km ? "ពេលវេលាមធ្យម" : "Avarage Time"} color="#0a1ee8" icon={<AlarmClock size={20} />} text={svc?.avgTime || "-"} />

        <div className="so-dh">{km ? "ព័ត៌មានលម្អិត" : "More Details"}</div>
        <div className="so-field" style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 18, lineHeight: 1.7 }}>
          {svc?.description || "-"}
        </div>
      </div>
    </div>
  );
}

function Detail({ title, icon, color, text }: { title: string; icon: ReactNode; color: string; text: string }) {
  return (
    <>
      <div className="so-dh">{title}</div>
      <div className="so-row">
        <span className="so-dot" style={{ background: color }}>{icon}</span>
        <span className="min-w-0 break-words">{text}</span>
      </div>
    </>
  );
}
