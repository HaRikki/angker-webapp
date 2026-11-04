"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { money, dt } from "@/lib/format";
import { useI18n } from "./Providers";
import { Skeleton, ErrorBox, Empty, StatusBadge, Pager } from "./kit";
import { AnimatedEmoji } from "./AnimatedEmoji";

type O = {
  id: string;
  serviceName: string;
  target: string;
  quantity: number;
  sellPrice: string;
  status: string;
  providerRef: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUSES = ["PENDING", "PROCESSING", "IN_PROGRESS", "COMPLETED", "PARTIAL", "CANCELLED", "FAILED"];
const SIZE = 15;

export function OrdersList() {
  const { t } = useI18n();
  const h = t.app.hist;
  const [st, setSt] = useState("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const x = setTimeout(() => { setDq(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(x);
  }, [q]);

  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(SIZE),
    ...(st ? { status: st } : {}),
    ...(dq ? { q: dq } : {}),
  });
  const { data, loading, error, reload } = useApi<{ orders: O[]; total: number }>(`/api/user/orders?${qs}`);

  return (
    <div className="space-y-3">
      <h1 className="tg-title">{h.title}</h1>

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={h.search}
          aria-label={h.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={40}
        />
        <select
          className="input w-[40%]"
          aria-label={h.status}
          value={st}
          onChange={(e) => { setSt(e.target.value); setPage(1); }}
        >
          <option value="">{h.all}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t.app.status[s]}</option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorBox onRetry={reload} />
      ) : loading || !data ? (
        <div className="tg-section space-y-0 p-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="tg-cell"><Skeleton className="h-10 w-full" /></div>
          ))}
        </div>
      ) : data.orders.length ? (
        <>
          <div className="tg-section">
            {data.orders.map((o) => (
              <Link key={o.id} href={`/orders/${o.id}`} className="tg-cell">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{o.serviceName}</div>
                  <div className="text-[12px] text-muted">
                    ×{o.quantity.toLocaleString()} · {dt(o.createdAt)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[13px] font-semibold tabular-nums">{money(o.sellPrice)}</span>
                  <StatusBadge s={o.status} />
                </div>
              </Link>
            ))}
          </div>
          <p className="px-1 text-[12px] text-muted">{data.total} {h.total}</p>
          <Pager page={page} total={data.total} size={SIZE} onChange={setPage} />
        </>
      ) : (
        <div className="tg-section"><div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <AnimatedEmoji emoji="📦" motion="float" size={64} />
              <p className="max-w-[240px] text-[14px] text-muted">
                No orders yet. Your purchases will appear here.
              </p>
            </div></div>
      )}
    </div>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const h = t.app.hist;
  const { data, loading, error, reload } = useApi<{
    order: O & { events: { kind: string; createdAt: string }[] };
  }>(`/api/user/orders/${encodeURIComponent(id)}`);

  if (error) {
    return (
      <div className="space-y-3">
        <Link href="/orders" className="btn-ghost !px-3"><ArrowLeft className="h-4 w-4" />{h.back}</Link>
        <ErrorBox onRetry={reload} />
      </div>
    );
  }
  if (loading || !data) {
    return <div className="tg-section space-y-3 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>;
  }

  const o = data.order;
  const rows: [string, React.ReactNode][] = [
    [h.service, o.serviceName],
    [h.target, <span key="t" className="break-all">{o.target}</span>],
    [h.qty, o.quantity.toLocaleString()],
    [h.price, money(o.sellPrice)],
    [h.status, <StatusBadge key="s" s={o.status} />],
    [h.ref, o.providerRef ?? "—"],
    [h.created, dt(o.createdAt)],
    [h.updated, dt(o.updatedAt)],
  ];
  const events = o.events.filter((e) => t.app.ev[e.kind]);

  return (
    <div className="space-y-3">
      <Link href="/orders" className="inline-flex items-center gap-1 text-[14px] font-medium text-cyan">
        <ArrowLeft className="h-4 w-4" />{h.back}
      </Link>
      <div className="tg-section">
        <div className="border-b border-line/60 px-4 py-3">
          <div className="text-[13px] text-muted">{h.id}</div>
          <div className="break-all font-mono text-[12px]">{o.id}</div>
        </div>
        {rows.map(([k, v]) => (
          <div key={k} className="tg-cell justify-between">
            <span className="text-muted">{k}</span>
            <span className="max-w-[60%] text-right font-medium">{v}</span>
          </div>
        ))}
      </div>
      {events.length > 0 && (
        <div className="tg-section p-4">
          <h2 className="mb-3 font-semibold">{h.timeline}</h2>
          <ol className="space-y-3 border-l-2 border-cyan/30 pl-4 text-[14px]">
            {events.map((e, i) => (
              <li key={i}>
                {t.app.ev[e.kind]}
                <span className="block text-[12px] text-muted">{dt(e.createdAt)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
