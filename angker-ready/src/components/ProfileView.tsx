"use client";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { money } from "@/lib/format";
import { useI18n } from "./Providers";
import { Skeleton, ErrorBox } from "./kit";
import { IconTile, PremiumIcon } from "./PremiumIcon";

type P = {
  username?: string;
  email?: string;
  balance?: string;
  totalOrders?: number;
  telegramId?: string | number | null;
  account?: { username: string };
  profile?: { username: string; email?: string };
};

type Dash = {
  totalOrders: number;
  balance: string;
  account: { username: string };
};

export function ProfileView() {
  const { lang } = useI18n() as { lang: string };
  const km = lang === "km";
  const profile = useApi<P>("/api/user/profile");
  const dash = useApi<Dash>("/api/user/dashboard");

  const loading = (profile.loading || dash.loading) && !profile.data && !dash.data;
  // only hard-error if BOTH fail
  if (profile.error && dash.error && !profile.data && !dash.data) {
    return <ErrorBox onRetry={() => { profile.reload(); dash.reload(); }} />;
  }
  if (loading) return <Skeleton className="h-80 w-full rounded-[24px]" />;

  const p = profile.data;
  const d = dash.data;
  const username =
    p?.username || p?.profile?.username || p?.account?.username || d?.account?.username || "User";
  const balance = p?.balance ?? d?.balance ?? "0";
  const orders = p?.totalOrders ?? d?.totalOrders ?? 0;
  const tgId = p?.telegramId ?? "—";

  return (
    <div className="space-y-4">
      <div
        className="relative overflow-hidden rounded-[24px] border border-line/40 bg-surface p-6 text-center"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 0%, rgb(37 99 235 / 0.12), transparent 60%)",
        }}
      >
        <div className="mx-auto mb-3">
          <IconTile name="profile" size={40} className="!mx-auto !h-20 !w-20 !rounded-full" />
        </div>
        <div className="text-[18px] font-bold tracking-tight">{username}</div>
        <div className="mt-0.5 text-[13px] text-muted">
          @{String(username).toLowerCase().replace(/\s/g, "_")}
        </div>
      </div>

      <div className="tg-section">
        <div className="tg-cell">
          <span className="text-muted">{km ? "សមតុល្យ" : "Balance"}</span>
          <span className="ml-auto font-bold tabular-nums text-emerald-500">
            {money(balance)}
          </span>
        </div>
        <div className="tg-cell">
          <span className="text-muted">{km ? "ការបញ្ជាទិញ" : "Orders"}</span>
          <span className="ml-auto font-bold tabular-nums">{orders}</span>
        </div>
        <div className="tg-cell">
          <span className="text-muted">{km ? "លេខសម្គាល់ Telegram" : "Telegram ID"}</span>
          <span className="ml-auto font-mono text-[13px] tabular-nums">{String(tgId)}</span>
        </div>
      </div>

      <Link href="/add-funds" className="store-primary-btn block">
        {km ? "បន្ថែមសមតុល្យ" : "Add balance"}
      </Link>

      <div className="tg-section">
        <Link href="/transactions" className="tg-cell tg-cell-chevron">
          <PremiumIcon name="card" size={20} />
          <span className="font-medium">{km ? "ប្រវត្តិទូទាត់" : "Transactions"}</span>
        </Link>
        <Link href="/services" className="tg-cell tg-cell-chevron">
          <PremiumIcon name="smm" size={20} />
          <span className="font-medium">{km ? "សេវា SMM" : "SMM services"}</span>
        </Link>
        <Link href="/digital" className="tg-cell tg-cell-chevron">
          <PremiumIcon name="digital" size={20} />
          <span className="font-medium">Digital</span>
        </Link>
        <Link href="/tickets" className="tg-cell tg-cell-chevron">
          <PremiumIcon name="chat" size={20} />
          <span className="font-medium">{km ? "ជំនួយ" : "Support"}</span>
        </Link>
        <Link href="/api-access" className="tg-cell tg-cell-chevron">
          <PremiumIcon name="key" size={20} />
          <span className="font-medium">API</span>
        </Link>
      </div>
    </div>
  );
}
