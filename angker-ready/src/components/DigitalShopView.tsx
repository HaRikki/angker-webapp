"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DIGITAL_PRODUCTS, type DigitalProduct } from "@/lib/digital-products";
import { useApi } from "@/lib/useApi";
import { money } from "@/lib/format";
import { useI18n } from "./Providers";
import {
  Loader2,
  Minus,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from "lucide-react";

type Dash = { balance: string };
type Product = DigitalProduct & {
  imageUrl?: string;
  category?: string | null;
  features?: string[];
};

/** Parse description lines — keep leading emoji if present */
function descLines(p: Product): string[] {
  if (p.features?.length) return p.features;
  return p.description || [];
}

export function DigitalShopView() {
  const { lang } = useI18n() as { lang: string };
  const km = lang === "km";
  const { data, reload: reloadDash } = useApi<Dash>("/api/user/dashboard");
  const balance = Number(data?.balance ?? 0);
  const [products, setProducts] = useState<Product[]>(DIGITAL_PRODUCTS as Product[]);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/public/digital-products")
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.products) && j.products.length) setProducts(j.products);
      })
      .catch(() => {});
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["all", ...Array.from(set)];
  }, [products]);

  const list = useMemo(
    () =>
      filter === "all" ? products : products.filter((p) => p.category === filter),
    [products, filter]
  );

  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [step, setStep] = useState<
    "detail" | "confirm" | "success" | "insufficient" | null
  >(null);
  const [promo, setPromo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [delivered, setDelivered] = useState("");
  const [descOpen, setDescOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const total = useMemo(
    () => (selected ? selected.price * qty : 0),
    [selected, qty]
  );

  const openDetail = (p: Product) => {
    setSelected(p);
    setQty(1);
    setPromo("");
    setMsg("");
    setDelivered("");
    setDescOpen(true);
    setCopied(false);
    setStep("detail");
  };

  const close = () => {
    setStep(null);
    setSelected(null);
    setMsg("");
  };

  const goBuy = () => {
    if (!selected || selected.stock <= 0) return;
    if (balance < total) {
      setStep("insufficient");
      return;
    }
    setStep("confirm");
  };

  const confirmBuy = async () => {
    if (!selected) return;
    if (balance < total) {
      setStep("insufficient");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/user/digital-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selected.id,
          quantity: qty,
          promoCode: promo || undefined,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const code = j.error || "";
        if (code === "INSUFFICIENT_BALANCE") {
          setStep("insufficient");
          return;
        }
        setMsg(j.message || j.error || (km ? "បរាជ័យ" : "Failed"));
        return;
      }
      setDelivered(j.delivery || "");
      setStep("success");
      reloadDash?.();
      fetch("/api/public/digital-products")
        .then((r) => r.json())
        .then((j2) => {
          if (Array.isArray(j2.products)) setProducts(j2.products);
        })
        .catch(() => {});
    } catch {
      setMsg(km ? "បរាជ័យ" : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const copyDesc = async () => {
    if (!selected) return;
    const text = descLines(selected).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4 pb-2">
      {/* ===== HERO — Store Account / Gemini style ===== */}
      <div
        className="relative overflow-hidden rounded-[22px] px-5 py-6"
        style={{
          background:
            "radial-gradient(ellipse 90% 80% at 70% 40%, rgba(60,40,120,0.55), transparent 55%), radial-gradient(ellipse 60% 50% at 20% 80%, rgba(30,60,140,0.35), transparent 50%), #0b1220",
          boxShadow: "0 0 0 1px rgba(80,100,180,0.2), 0 12px 40px rgba(0,0,0,0.35)",
        }}
      >
        {/* Floating decorative orbs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute right-6 top-4 h-10 w-10 rounded-full opacity-40"
            style={{
              background: "radial-gradient(circle, #6366f1, transparent 70%)",
              boxShadow: "0 0 24px #6366f1",
            }}
          />
          <div
            className="absolute bottom-5 right-16 h-7 w-7 rounded-full opacity-30"
            style={{
              background: "radial-gradient(circle, #22d3ee, transparent 70%)",
            }}
          />
          <div
            className="absolute left-8 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[14px] text-white/50"
          >
            ✎
          </div>
          <div
            className="absolute bottom-4 left-1/2 text-[16px] text-white/20"
          >
            {"</>"}
          </div>
          <div className="absolute right-10 bottom-8 text-[14px] text-white/15">📦</div>
        </div>

        <div className="relative z-10">
          <div className="text-[22px] font-bold leading-tight text-white">
            {km ? "ហាងគណនី" : "Store Account"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-medium text-white/55">
              {km ? "ផលិតផលឌីជីថល premium" : "digital product premium"}
            </span>
            <span
              className="text-[28px] font-black tracking-tight"
              style={{
                background: "linear-gradient(90deg, #60a5fa, #a78bfa, #f472b6)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Gemini
            </span>
          </div>
          <Link
            href="/add-funds"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#3b82f6] px-4 py-2 text-[13px] font-semibold text-white shadow-lg shadow-blue-500/30 transition active:scale-95"
          >
            + {km ? "បន្ថែមសមតុល្យ" : "Add balance"}
          </Link>
        </div>
      </div>

      {/* Category chips */}
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFilter(c)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
                filter === c
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                  : "border border-line bg-surface text-muted"
              }`}
            >
              {c === "all" ? (km ? "ទាំងអស់" : "All") : c}
            </button>
          ))}
        </div>
      )}

      {/* Featured header */}
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-[16px] font-bold text-[var(--ink)]">
          {km ? "ផលិតផលពិសេស" : "Featured products"}
        </h2>
        <span className="text-[13px] text-muted">
          {list.length} {km ? "មុខ" : "items"}
        </span>
      </div>

      {/* ===== Product grid 2-col ===== */}
      <div className="grid grid-cols-2 gap-3">
        {list.map((p) => {
          const inStock = p.stock > 0;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => openDetail(p)}
              className="group overflow-hidden rounded-[18px] text-left transition active:scale-[0.98]"
              style={{
                background: "#151a24",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.25)",
              }}
            >
              {/* Image area */}
              <div className="relative flex aspect-[4/3] items-center justify-center bg-white">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-full w-full object-contain p-3"
                  />
                ) : (
                  <span className="text-5xl drop-shadow-sm">{p.emoji || "💎"}</span>
                )}
                {/* Stock badge */}
                <span
                  className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    inStock
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-600"
                  }`}
                >
                  {inStock
                    ? km
                      ? "មានស្តុក"
                      : "In stock"
                    : km
                      ? "អស់ស្តុក"
                      : "Sold out"}
                </span>
              </div>

              {/* Info bar */}
              <div className="px-3 pb-3 pt-2.5">
                <div className="flex items-start gap-1.5">
                  <span className="mt-0.5 shrink-0 text-[13px]">
                    {p.emoji || "•"}
                  </span>
                  <div className="line-clamp-2 text-[12px] font-semibold leading-snug text-white/90">
                    {p.name}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[15px] font-bold tabular-nums text-emerald-400">
                    {money(p.price)}
                  </span>
                  <span className="text-[11px] tabular-nums text-white/40">
                    {inStock
                      ? `${p.stock} ${km ? "នៅសល់" : "left"}`
                      : km
                        ? "អស់"
                        : "Out"}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {!list.length && (
        <div className="rounded-2xl border border-line/40 bg-surface px-4 py-16 text-center text-[14px] text-muted">
          {km ? "មិនទាន់មានផលិតផល" : "No products yet"}
        </div>
      )}

      {/* ===== MODALS ===== */}
      {step && selected && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[3px]"
            onClick={close}
            aria-hidden
          />

          <div
            className="relative z-10 flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[24px] sm:rounded-[24px]"
            style={{
              background: "#12151c",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 25px 80px rgba(0,0,0,0.6)",
            }}
          >
            {/* ---- DETAIL ---- */}
            {step === "detail" && (
              <>
                <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
                  <h2 className="text-[16px] font-semibold text-white">
                    {km ? "ព័ត៌មានផលិតផល" : "Product details"}
                  </h2>
                  <button
                    type="button"
                    onClick={close}
                    className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition active:bg-white/10"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
                  {/* Product image */}
                  <div className="overflow-hidden rounded-2xl bg-white">
                    {selected.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selected.imageUrl}
                        alt=""
                        className="mx-auto max-h-52 w-full object-contain p-4"
                      />
                    ) : (
                      <div className="grid h-44 place-items-center text-6xl">
                        {selected.emoji || "💎"}
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="text-[18px] font-bold text-white">
                      {selected.name}
                    </div>
                    <div className="mt-1 text-[22px] font-bold tabular-nums text-blue-400">
                      {money(selected.price)}
                    </div>
                  </div>

                  {/* Description toggle */}
                  <button
                    type="button"
                    onClick={() => setDescOpen((o) => !o)}
                    className="mt-4 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition active:bg-white/10"
                  >
                    <span className="text-[13px] font-medium text-white/80">
                      {km
                        ? "អានការពិពណ៌នាមុន រួចបញ្ជាក់ទិញ"
                        : "Read description first, confirm buy"}{" "}
                      👇
                    </span>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-600 text-white">
                      {descOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </span>
                  </button>

                  {descOpen && descLines(selected).length > 0 && (
                    <div className="mt-3 space-y-2 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                      {descLines(selected).map((line, i) => (
                        <div
                          key={i}
                          className="text-[13px] leading-relaxed text-white/75"
                        >
                          {line}
                        </div>
                      ))}
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={copyDesc}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] font-semibold text-white/80 transition active:bg-white/10"
                        >
                          {copied ? (
                            <>
                              <Check size={13} className="text-emerald-400" />
                              {km ? "បានចម្លង" : "Copied"}
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              {km ? "ចម្លងការពិពណ៌នា" : "Copy description"}
                            </>
                          )}
                        </button>
                        <span className="text-[11px] text-white/35">
                          {km
                            ? "ជ្រើសអត្ថបទ ឬចុចចម្លង"
                            : "Select the text to copy, or tap Copy."}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Meta rows */}
                  <div className="mt-4 space-y-0 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
                    <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
                      <span className="text-[13px] text-white/50">
                        {km ? "ស្តុក" : "Availability"}
                      </span>
                      <span
                        className={`text-[13px] font-semibold ${
                          selected.stock > 0
                            ? "text-emerald-400"
                            : "text-rose-400"
                        }`}
                      >
                        {selected.stock > 0
                          ? km
                            ? "មានស្តុក"
                            : "In stock"
                          : km
                            ? "អស់ស្តុក"
                            : "Sold out"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/6 px-4 py-3">
                      <span className="text-[13px] text-white/50">
                        {km ? "ការដឹក" : "Delivery"}
                      </span>
                      <span className="text-[13px] font-semibold text-white/90">
                        {selected.delivery || "Instant"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-[13px] text-white/50">
                        {km ? "បរិមាណ" : "Quantity"}
                      </span>
                      <div className="flex overflow-hidden rounded-xl border border-white/15">
                        <button
                          type="button"
                          className="grid h-9 w-10 place-items-center text-white/70 transition active:bg-white/10"
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                        >
                          <Minus size={15} />
                        </button>
                        <span className="grid h-9 min-w-[36px] place-items-center border-x border-white/15 text-[14px] font-bold tabular-nums text-white">
                          {qty}
                        </span>
                        <button
                          type="button"
                          className="grid h-9 w-10 place-items-center text-white/70 transition active:bg-white/10"
                          onClick={() =>
                            setQty((q) => Math.min(selected.stock || 20, q + 1))
                          }
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>
                  </div>

                  <p className="mt-3 text-center text-[12px] leading-relaxed text-white/40">
                    {km
                      ? "កាបូបរបស់អ្នកនឹងត្រូវគិតប្រាក់ ហើយគណនីត្រូវបានផ្ដល់ភ្លាមៗ។"
                      : "Your wallet is charged and the account is delivered instantly."}
                  </p>
                </div>

                {/* Sticky buy */}
                <div
                  className="shrink-0 border-t border-white/6 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3"
                  style={{ background: "rgba(12,14,20,0.97)" }}
                >
                  <button
                    type="button"
                    disabled={selected.stock <= 0}
                    onClick={goBuy}
                    className="w-full rounded-2xl bg-[#3b82f6] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-blue-500/25 transition active:scale-[0.98] disabled:opacity-40"
                  >
                    {selected.stock <= 0
                      ? km
                        ? "អស់ស្តុក"
                        : "Out of stock"
                      : `${km ? "ទិញឥឡូវ" : "Buy now"} — ${money(total)}`}
                  </button>
                </div>
              </>
            )}

            {/* ---- CONFIRM ---- */}
            {step === "confirm" && (
              <>
                <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
                  <h2 className="text-[16px] font-semibold text-white">
                    {km ? "បញ្ជាក់ការទិញ" : "Confirm purchase"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setStep("detail")}
                    className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition active:bg-white/10"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  <div className="overflow-hidden rounded-2xl bg-white">
                    {selected.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selected.imageUrl}
                        alt=""
                        className="mx-auto max-h-44 w-full object-contain p-4"
                      />
                    ) : (
                      <div className="grid h-36 place-items-center text-5xl">
                        {selected.emoji || "💎"}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 text-center">
                    <div className="text-[17px] font-bold text-white">
                      {selected.name}
                    </div>
                    <div className="mt-1 text-[14px] tabular-nums text-white/50">
                      {money(total)} × {qty}
                    </div>
                  </div>

                  <div className="mt-5">
                    <label className="mb-1.5 block text-[12px] text-white/45">
                      {km ? "លេខកូដបញ្ចុះតម្លៃ (ស្រេចចិត្ត)" : "Promo code (optional)"}
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={promo}
                        onChange={(e) => setPromo(e.target.value)}
                        placeholder={km ? "បញ្ចូលលេខកូដ" : "Enter promo code"}
                        className="min-w-0 flex-1 rounded-xl border border-white/12 bg-white/5 px-3.5 py-2.5 text-[14px] text-white outline-none placeholder:text-white/30 focus:border-blue-500/50"
                      />
                      <button
                        type="button"
                        className="shrink-0 rounded-xl border border-white/12 bg-white/5 px-4 text-[13px] font-semibold text-white/80 transition active:bg-white/10"
                      >
                        {km ? "អនុវត្ត" : "Apply"}
                      </button>
                    </div>
                  </div>

                  <p className="mt-4 text-center text-[13px] text-white/45">
                    {km
                      ? `កាបូបរបស់អ្នកនឹងត្រូវគិតប្រាក់ ${money(total)}។`
                      : `Your wallet will be charged ${money(total)}.`}
                  </p>

                  {msg && (
                    <p className="mt-3 rounded-xl bg-rose-500/15 px-3 py-2 text-center text-[13px] text-rose-300">
                      {msg}
                    </p>
                  )}
                </div>

                <div
                  className="flex shrink-0 gap-3 border-t border-white/6 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3"
                  style={{ background: "rgba(12,14,20,0.97)" }}
                >
                  <button
                    type="button"
                    onClick={() => setStep("detail")}
                    className="flex-1 rounded-2xl border border-white/12 py-3.5 text-[15px] font-semibold text-white/80 transition active:bg-white/5"
                  >
                    {km ? "បោះបង់" : "Cancel"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={confirmBuy}
                    className="flex-1 rounded-2xl bg-[#3b82f6] py-3.5 text-[15px] font-bold text-white shadow-lg shadow-blue-500/25 transition active:scale-[0.98] disabled:opacity-50"
                  >
                    {busy ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="animate-spin" size={16} />
                        …
                      </span>
                    ) : (
                      `${km ? "បញ្ជាក់" : "Confirm"} — ${money(total)}`
                    )}
                  </button>
                </div>
              </>
            )}

            {/* ---- SUCCESS ---- */}
            {step === "success" && (
              <div className="space-y-4 p-6 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/20 text-3xl">
                  ✓
                </div>
                <div className="text-[18px] font-bold text-white">
                  {km ? "ទិញជោគជ័យ!" : "Purchase successful!"}
                </div>
                <p className="text-[13px] text-white/55">
                  {km
                    ? "គណនីត្រូវបានផ្ដល់ភ្លាមៗ។ ពិនិត្យនៅ Orders / Notifications។"
                    : "Account delivered instantly. Check Orders / Notifications."}
                </p>
                {delivered && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                      Delivery
                    </div>
                    <pre className="whitespace-pre-wrap break-all text-[13px] text-white/85">
                      {delivered}
                    </pre>
                  </div>
                )}
                <button
                  type="button"
                  onClick={close}
                  className="w-full rounded-2xl bg-[#3b82f6] py-3.5 text-[15px] font-bold text-white"
                >
                  {km ? "រួចរាល់" : "Done"}
                </button>
              </div>
            )}

            {/* ---- INSUFFICIENT ---- */}
            {step === "insufficient" && (
              <div className="space-y-4 p-6 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-500/20 text-3xl">
                  ⚠
                </div>
                <div className="text-[18px] font-bold text-white">
                  {km ? "សមតុល្យមិនគ្រប់" : "Insufficient balance"}
                </div>
                <p className="text-[13px] text-white/55">
                  {km
                    ? `ត្រូវការ ${money(total)} · មាន ${money(balance)}`
                    : `Need ${money(total)} · Have ${money(balance)}`}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={close}
                    className="flex-1 rounded-2xl border border-white/12 py-3.5 text-[15px] font-semibold text-white/80"
                  >
                    {km ? "បិទ" : "Close"}
                  </button>
                  <Link
                    href="/add-funds"
                    className="flex-1 rounded-2xl bg-[#3b82f6] py-3.5 text-center text-[15px] font-bold text-white"
                  >
                    {km ? "បន្ថែមសមតុល្យ" : "Add balance"}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
