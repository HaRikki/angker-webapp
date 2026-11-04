"use client";
import Link from "next/link";
import { useApi } from "@/lib/useApi";
import { money, dt } from "@/lib/format";
import { useI18n } from "./Providers";
import { Skeleton, ErrorBox, Empty, StatusBadge } from "./kit";
import { IconTile, PremiumIcon } from "./PremiumIcon";
import { ChevronRight } from "lucide-react";

type D = {
  balance: string;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  failedOrders?: number;
  totalDeposits: number;
  totalSpending: number;
  recentOrders: {
    id: string;
    serviceName: string;
    quantity: number;
    sellPrice: string;
    status: string;
    createdAt: string;
  }[];
  latestTransactions: {
    id: string;
    type: string;
    amount: string;
    description: string;
    createdAt: string;
  }[];
  announcements: { id: string; title: string; body: string }[];
  account: { username: string; email: string };
};

export function DashboardView() {
  const { lang } = useI18n() as { lang: string };
  const km = lang === "km";
  const { data, loading, error, reload } = useApi<D>("/api/user/dashboard");

  if (error) return <ErrorBox onRetry={reload} />;
  if (loading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full rounded-[24px]" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24 rounded-[20px]" />
          <Skeleton className="h-24 rounded-[20px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-5 text-white shadow-xl shadow-blue-500/25">
        <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative z-10">
          <div className="text-[12px] font-medium opacity-90">
            {km ? "សូមស្វាគមន៍" : "Welcome back"}
          </div>
          <div className="mt-0.5 text-[20px] font-bold tracking-tight">
            {data.account?.username || "User"}
          </div>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] opacity-80">{km ? "សមតុល្យ" : "Balance"}</div>
              <div className="text-[32px] font-bold leading-none tabular-nums">
                {money(data.balance)}
              </div>
            </div>
            <Link
              href="/add-funds"
              className="rounded-full bg-white/20 px-4 py-2.5 text-[13px] font-bold backdrop-blur transition active:scale-95"
            >
              + {km ? "បន្ថែម" : "Add"}
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          {
            label: km ? "ការបញ្ជាទិញ" : "Orders",
            value: data.totalOrders,
            icon: "orders" as const,
            href: "/orders",
          },
          {
            label: km ? "កំពុងរង់ចាំ" : "Pending",
            value: data.pendingOrders,
            icon: "box" as const,
            href: "/orders",
          },
          {
            label: km ? "ចំណាយ" : "Spent",
            value: money(data.totalSpending),
            icon: "card" as const,
            href: "/transactions",
          },
          {
            label: km ? "បញ្ចូល" : "Deposits",
            value: money(data.totalDeposits),
            icon: "wallet" as const,
            href: "/add-funds",
          },
        ].map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="glass flex items-center gap-3 p-3.5 transition active:scale-[0.98]"
          >
            <IconTile name={s.icon} size={22} />
            <div className="min-w-0">
              <div className="text-[11px] text-muted">{s.label}</div>
              <div className="truncate text-[16px] font-bold tabular-nums">{s.value}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { href: "/services", icon: "smm" as const, label: "SMM" },
          { href: "/digital", icon: "digital" as const, label: "Digital" },
          { href: "/add-funds", icon: "wallet" as const, label: km ? "Wallet" : "Wallet" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex flex-col items-center gap-2 rounded-[20px] border border-line/50 bg-surface py-4 transition active:scale-95"
          >
            <IconTile name={a.icon} size={26} />
            <span className="text-[12px] font-bold">{a.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent orders */}
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[15px] font-bold">{km ? "ការបញ្ជាទិញថ្មី" : "Recent orders"}</h2>
          <Link href="/orders" className="flex items-center gap-0.5 text-[12px] font-semibold text-cyan">
            {km ? "ទាំងអស់" : "See all"} <ChevronRight size={14} />
          </Link>
        </div>
        {data.recentOrders?.length ? (
          <div className="tg-section">
            {data.recentOrders.slice(0, 5).map((o) => (
              <Link key={o.id} href={`/orders/${o.id}`} className="tg-cell tg-cell-chevron">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold">{o.serviceName}</div>
                  <div className="text-[11px] text-muted">
                    ×{o.quantity} · {money(o.sellPrice)} · {dt(o.createdAt)}
                  </div>
                </div>
                <StatusBadge s={o.status} />
              </Link>
            ))}
          </div>
        ) : (
          <Empty text={km ? "មិនទាន់មានការបញ្ជាទិញ" : "No orders yet"} />
        )}
      </div>

      {/* Announcements */}
      {data.announcements?.length > 0 && (
        <div className="space-y-2">
          {data.announcements.slice(0, 2).map((a) => (
            <div key={a.id} className="rounded-2xl border border-cyan/20 bg-cyan/5 px-4 py-3">
              <div className="text-[13px] font-bold">{a.title}</div>
              <div className="mt-0.5 text-[12px] text-muted line-clamp-2">{a.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
