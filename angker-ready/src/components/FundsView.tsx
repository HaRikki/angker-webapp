"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApi } from "@/lib/useApi";
import { money } from "@/lib/format";
import { useI18n } from "./Providers";
import { Skeleton, ErrorBox } from "./kit";
import { IconTile } from "./PremiumIcon";
import { Loader2, Lock, X } from "lucide-react";

const PRESETS = [1, 5, 10, 20, 50, 100];

type Dash = { balance?: string };

type DepositRes = {
  deposit?: {
    id: string;
    reference?: string;
    amount: string | number;
    qrString?: string | null;
    cardImage?: string | null;
    payUrl?: string | null;
    expiresAt?: string | null;
    status?: string;
  };
  error?: string;
  message?: string;
};

function formatRemain(ms: number) {
  if (ms <= 0) return "00:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Full-screen ABA KHQR deposit modal — matches the PayWay-style screenshots. */
function KhqrModal({
  deposit,
  onClose,
  onPaid,
  km,
}: {
  deposit: NonNullable<DepositRes["deposit"]>;
  onClose: () => void;
  onPaid: () => void;
  km: boolean;
}) {
  const [remain, setRemain] = useState(() => {
    if (!deposit.expiresAt) return 5 * 60 * 1000;
    return Math.max(0, new Date(deposit.expiresAt).getTime() - Date.now());
  });
  const [status, setStatus] = useState<"PENDING" | "PAID" | "EXPIRED">(
    (deposit.status as "PENDING" | "PAID" | "EXPIRED") || "PENDING"
  );
  const paidOnce = useRef(false);

  // Countdown
  useEffect(() => {
    if (status !== "PENDING") return;
    const t = setInterval(() => {
      if (!deposit.expiresAt) {
        setRemain((r) => Math.max(0, r - 1000));
        return;
      }
      const left = Math.max(0, new Date(deposit.expiresAt).getTime() - Date.now());
      setRemain(left);
      if (left <= 0) setStatus("EXPIRED");
    }, 1000);
    return () => clearInterval(t);
  }, [deposit.expiresAt, status]);

  // Poll deposit status every 4s
  useEffect(() => {
    if (status !== "PENDING") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch("/api/user/deposits?page=1&pageSize=10");
        const j = (await r.json().catch(() => ({}))) as {
          deposits?: Array<{ id: string; status: string }>;
        };
        if (cancelled) return;
        const row = j.deposits?.find((d) => d.id === deposit.id);
        if (row?.status === "PAID") {
          setStatus("PAID");
          if (!paidOnce.current) {
            paidOnce.current = true;
            onPaid();
          }
        } else if (row?.status === "EXPIRED") {
          setStatus("EXPIRED");
        }
      } catch {
        /* ignore */
      }
    };
    poll();
    const t = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [deposit.id, status, onPaid]);

  const payRef = deposit.reference || deposit.id;
  const amountStr = money(deposit.amount);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet */}
      <div
        className="relative z-10 flex max-h-[96dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[28px] sm:rounded-[28px]"
        style={{
          background: "linear-gradient(180deg, #0c0c12 0%, #120a0e 40%, #0a0a0f 100%)",
          boxShadow: "0 0 0 1px rgba(180,40,40,0.35), 0 25px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[17px] font-semibold text-white">
            {km ? "ដាក់ប្រាក់" : "Deposit"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-white/70 transition active:bg-white/10"
            aria-label="Close"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0 pb-2">
          {/* Branding + amount + QR card */}
          <div
            className="relative mx-3 overflow-hidden rounded-2xl"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(120,20,30,0.45), transparent 70%), #0e0e14",
            }}
          >
            {/* Dotted pattern */}
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(180,50,50,0.55) 1px, transparent 1.5px)",
                backgroundSize: "14px 14px",
              }}
            />

            <div className="relative px-4 pb-5 pt-6 text-center">
              {/* PAYWAY logo */}
              <div className="mb-1 text-[28px] font-black tracking-tight leading-none">
                <span className="text-white">PAY</span>
                <span style={{ color: "#f5a623" }}>WAY</span>
              </div>
              <div
                className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: "rgba(255,255,255,0.55)" }}
              >
                BY ABA BANK
              </div>

              <div
                className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                SCAN TO PAY
              </div>
              <div className="mb-5 flex items-baseline justify-center gap-1.5">
                <span className="text-[36px] font-bold tabular-nums tracking-tight text-white">
                  {amountStr}
                </span>
                <span
                  className="text-[13px] font-bold uppercase"
                  style={{ color: "#f5a623" }}
                >
                  USD
                </span>
              </div>

              {/* QR / card image */}
              <div className="mx-auto max-w-[280px]">
                {deposit.cardImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={deposit.cardImage}
                    alt="KHQR"
                    className="mx-auto w-full rounded-xl object-contain"
                    style={{
                      filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.55))",
                    }}
                  />
                ) : deposit.qrString ? (
                  <div
                    className="mx-auto overflow-hidden rounded-xl bg-white p-3"
                    style={{
                      boxShadow: "0 0 0 3px rgba(200,40,40,0.5), 0 12px 28px rgba(0,0,0,0.55)",
                    }}
                  >
                    {/* Fallback: API card missing — show raw string hint */}
                    <div className="flex aspect-square items-center justify-center bg-white p-2 text-center text-[11px] text-slate-500 break-all">
                      {deposit.qrString.slice(0, 80)}…
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto grid aspect-square max-w-[240px] place-items-center rounded-xl bg-white/10 text-white/50">
                    <Loader2 className="animate-spin" size={32} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Waiting / status card */}
          <div className="mx-3 mt-4 overflow-hidden rounded-2xl" style={{ background: "#12121a" }}>
            {/* Character / animation area */}
            <div
              className="relative flex h-[140px] items-center justify-center overflow-hidden"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(80,20,30,0.35), transparent 70%)",
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, rgba(180,50,50,0.5) 1px, transparent 1.5px)",
                  backgroundSize: "12px 12px",
                }}
              />
              {status === "PAID" ? (
                <div className="relative text-center">
                  <div className="mx-auto mb-2 grid h-16 w-16 place-items-center rounded-full bg-emerald-500/20 text-3xl">
                    ✓
                  </div>
                  <div className="text-[15px] font-bold text-emerald-400">
                    {km ? "បានទទួលប្រាក់!" : "Payment received!"}
                  </div>
                </div>
              ) : status === "EXPIRED" ? (
                <div className="relative text-center">
                  <div className="mx-auto mb-2 grid h-16 w-16 place-items-center rounded-full bg-rose-500/20 text-3xl">
                    ✕
                  </div>
                  <div className="text-[15px] font-bold text-rose-400">
                    {km ? "ផុតកំណត់" : "Expired"}
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {/* Running figure — CSS animation placeholder matching screenshot vibe */}
                  <div
                    className="khqr-run"
                    aria-hidden
                    style={{
                      width: 72,
                      height: 88,
                      background:
                        "linear-gradient(180deg, #2a2a35 0%, #1a1a22 100%)",
                      borderRadius: "40% 40% 30% 30%",
                      position: "relative",
                      animation: "khqr-bounce 0.7s ease-in-out infinite",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 10,
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "#3a3a48",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 8,
                        left: 12,
                        width: 14,
                        height: 28,
                        borderRadius: 6,
                        background: "#252530",
                        animation: "khqr-leg 0.35s ease-in-out infinite alternate",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 8,
                        right: 12,
                        width: 14,
                        height: 28,
                        borderRadius: 6,
                        background: "#252530",
                        animation: "khqr-leg 0.35s ease-in-out infinite alternate-reverse",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Status bar */}
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{
                background: "rgba(20,12,16,0.9)",
                borderTop: "1px solid rgba(180,40,40,0.25)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    status === "PAID"
                      ? "bg-emerald-400"
                      : status === "EXPIRED"
                        ? "bg-rose-400"
                        : "bg-rose-500 animate-pulse"
                  }`}
                />
                <span className="text-[13px] font-medium text-white/90">
                  {status === "PAID"
                    ? km
                      ? "បានបង់រួច"
                      : "Paid"
                    : status === "EXPIRED"
                      ? km
                        ? "ផុតកំណត់"
                        : "Expired"
                      : km
                        ? "កំពុងរង់ចាំការទូទាត់"
                        : "Waiting for payment"}
                </span>
              </div>
              {status === "PENDING" && (
                <span
                  className="text-[14px] font-bold tabular-nums"
                  style={{ color: "#f5a623" }}
                >
                  {formatRemain(remain)}
                </span>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="px-5 pb-2 pt-4 text-center">
            <p className="text-[13px] leading-relaxed text-white/55">
              {km
                ? "បើក app ធនាគាររបស់អ្នក រួចស្កេន។ អេក្រង់នេះធ្វើបច្ចុប្បន្នភាពដោយស្វ័យប្រវត្តិ។"
                : "Open your banking app and scan. This screen updates automatically."}
            </p>
            <p className="mt-2 text-[12px] text-white/40">
              {km ? "លេខបង់ប្រាក់" : "Payment"} #{payRef}
              {km ? " (រក្សាទុកសម្រាប់ជំនួយ)" : " (save this for support)"}
            </p>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-white/35">
              <Lock size={12} />
              <span>
                {km ? "ការទូទាត់សុវត្ថិភាពដោយ ABA PayWay" : "Secure payment by ABA PayWay"}
              </span>
            </div>
          </div>
        </div>

        {/* Footer close */}
        <div
          className="shrink-0 border-t border-white/5 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3"
          style={{ background: "rgba(8,8,12,0.95)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl py-3.5 text-center text-[15px] font-semibold text-white/90 transition active:bg-white/5"
          >
            {status === "PAID"
              ? km
                ? "រួចរាល់"
                : "Done"
              : km
                ? "បិទ"
                : "Close"}
          </button>
        </div>
      </div>

    </div>
  );
}

export function FundsView() {
  const { lang } = useI18n() as { lang: string };
  const km = lang === "km";
  const { data, loading, error, reload } = useApi<Dash>("/api/user/dashboard");
  const [amount, setAmount] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [qr, setQr] = useState<DepositRes["deposit"] | null>(null);

  const handlePaid = useCallback(() => {
    reload?.();
    setMsg(km ? "បានទទួលប្រាក់ — សមតុល្យបានធ្វើបច្ចុប្បន្នភាព" : "Payment received — balance updated");
  }, [reload, km]);

  if (error) return <ErrorBox onRetry={reload} />;
  if (loading && !data) return <Skeleton className="h-64 w-full rounded-[24px]" />;

  const bal = data?.balance ?? "0";

  const submit = async () => {
    const n = Number(amount);
    if (!n || n <= 0) {
      setMsg(km ? "បញ្ចូលចំនួនទឹកប្រាក់" : "Enter an amount");
      return;
    }
    setBusy(true);
    setMsg("");
    setQr(null);
    try {
      const r = await fetch("/api/user/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: n }),
      });
      const j = (await r.json().catch(() => ({}))) as DepositRes & {
        error?: string;
        message?: string;
      };
      if (!r.ok) {
        const code = j.error || "";
        if (code === "PAYMENT_UNAVAILABLE" || code === "RATE_LIMITED") {
          setMsg(
            km
              ? code === "RATE_LIMITED"
                ? "សូមរង់ចាំបន្តិច — ស្នើច្រើនពេក"
                : "ការទូទាត់មិនទាន់កំណត់ (ABA_MERCHANT_ID / ABA_API_KEY)"
              : code === "RATE_LIMITED"
                ? "Too many requests — wait a bit"
                : "Payment not configured (set ABA_MERCHANT_ID + ABA_API_KEY)"
          );
        } else {
          setMsg(j.message || j.error || (km ? "បរាជ័យ" : "Failed"));
        }
        return;
      }
      const d = j.deposit;
      if (!d) {
        setMsg(km ? "គ្មានទិន្នន័យ QR" : "No QR data");
        return;
      }
      setQr(d);
    } catch {
      setMsg(km ? "បរាជ័យ — សូមព្យាយាមម្តងទៀត" : "Failed — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 pb-2">
      {/* Balance card */}
      <div className="relative overflow-hidden rounded-[24px] border border-line/40 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 dark:from-blue-950/40 dark:to-indigo-950/30">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted">
          {km ? "សមតុល្យកាបូប" : "Wallet balance"}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[36px] font-bold tracking-tight text-emerald-600 tabular-nums dark:text-emerald-400">
            {money(bal)}
          </span>
          <IconTile name="wallet" size={28} />
        </div>
      </div>

      {/* Add funds */}
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[15px] font-bold">{km ? "បន្ថែមសមតុល្យ" : "Add balance"}</h2>
          <div className="flex items-center gap-1">
            <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-500">
              ABA
            </span>
            <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-500">
              QR
            </span>
          </div>
        </div>

        <div className="glass space-y-4 p-4">
          <div className="grid grid-cols-3 gap-2.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(p)}
                className={`store-amount-btn ${
                  amount === p ? "active border-cyan bg-cyan/10 text-cyan" : ""
                }`}
              >
                ${p}
              </button>
            ))}
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted">
              {km ? "ចំនួនផ្ទាល់ខ្លួន (USD)" : "Custom amount (USD)"}
            </label>
            <input
              type="number"
              min={0.1}
              step={0.01}
              placeholder="e.g. 3.50"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="w-full rounded-2xl border border-line bg-bg px-4 py-3.5 text-[15px] outline-none focus:border-cyan focus:ring-2 focus:ring-cyan/20"
            />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="store-primary-btn disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="animate-spin" size={18} />
                {km ? "កំពុងបង្កើត…" : "Generating…"}
              </span>
            ) : km ? (
              "បង្កើត ABA QR"
            ) : (
              "Generate ABA QR"
            )}
          </button>

          <p className="text-center text-[12px] text-muted">
            {km
              ? "ស្កេន QR ដោយ app ធនាគារ។ សមតុល្យធ្វើបច្ចុប្បន្នភាពស្វ័យប្រវត្តិ។"
              : "Scan the QR with any banking app. Balance updates automatically."}
          </p>

          {msg && (
            <p className="rounded-xl bg-cyan/10 px-3 py-2 text-center text-[13px] font-medium text-cyan whitespace-pre-wrap">
              {msg}
            </p>
          )}
        </div>
      </div>

      {/* KHQR Modal */}
      {qr && (
        <KhqrModal
          deposit={qr}
          km={km}
          onClose={() => setQr(null)}
          onPaid={handlePaid}
        />
      )}
    </div>
  );
}
