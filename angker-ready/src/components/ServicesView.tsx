"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useApi } from "@/lib/useApi";
import { money } from "@/lib/format";
import { useI18n } from "./Providers";
import { Skeleton, ErrorBox, Empty, Pager } from "./kit";
import { IconTile, PremiumIcon } from "./PremiumIcon";

export type Svc = {
  id: string;
  num: number;
  categoryId: string;
  name: string;
  description: string;
  minQty: number;
  maxQty: number;
  sellPrice: string;
  refill: boolean;
  cancel: boolean;
};
export type Cat = { id: string; name: string };
const SIZE = 12;

const ICONS = ["spark", "rocket", "gem", "star", "zap", "smm", "digital", "box", "star", "zap"] as const;

function Card({ s, idx }: { s: Svc; idx: number }) {
  const { t, lang } = useI18n() as { t: any; lang: string };
  const a = t.app.svc;
  const km = lang === "km";
  const icon = ICONS[idx % ICONS.length];
  const inStock = s.maxQty > 0;

  return (
    <Link href={`/new-order?service=${s.id}`} className="store-card flex flex-col gap-2">
      <div className="relative flex aspect-square items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-800 dark:to-blue-950/40">
        <IconTile name={icon} size={36} />
        <span
          className={`badge-stock absolute right-2 top-2 ${
            inStock ? "badge-in" : "badge-out"
          }`}
        >
          {inStock ? (km ? "មានស្តុក" : "In stock") : (km ? "អស់" : "Sold out")}
        </span>
      </div>
      <div className="min-w-0 px-0.5">
        <div className="line-clamp-2 text-[13px] font-bold leading-snug">{s.name}</div>
        <div className="mt-1.5 flex items-end justify-between gap-1">
          <span className="text-[15px] font-bold tabular-nums text-cyan">
            {money(s.sellPrice)}
          </span>
          <span className="text-[10px] text-muted">
            {inStock ? `${s.minQty}+` : (km ? "អស់" : "Out")}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ServicesView() {
  const { t, lang } = useI18n() as { t: any; lang: string };
  const a = t.app.svc;
  const km = lang === "km";
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [cat, setCat] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const x = setTimeout(() => {
      setDq(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(x);
  }, [q]);

  const cats = useApi<{ categories: Cat[] }>("/api/public/categories");
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(SIZE),
    sort,
    ...(dq ? { q: dq } : {}),
    ...(cat ? { categoryId: cat } : {}),
  });
  const { data, loading, error, reload } = useApi<{ services: Svc[]; total: number }>(
    `/api/public/services?${qs}`
  );

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="store-hero !py-4">
        <div className="relative z-10">
          <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
            {km ? "សេវា SMM" : "SMM services"}
          </div>
          <div className="mt-0.5 text-[20px] font-bold">SMM</div>
          <Link
            href="/add-funds"
            className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-[12px] font-semibold backdrop-blur-sm"
          >
            <PremiumIcon name="spark" size={16} active />
            {km ? "បន្ថែមសមតុល្យ" : "+ Add balance"}
          </Link>
        </div>
        <div className="pointer-events-none absolute -right-1 top-0 text-6xl opacity-20">
          <PremiumIcon name="spark" size={16} active />
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 py-2.5 text-[14px] outline-none focus:border-cyan"
          placeholder={a.search || "Search…"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={80}
        />
        <select
          className="max-w-[120px] rounded-2xl border border-line bg-surface px-2 py-2.5 text-[13px]"
          value={cat}
          onChange={(e) => {
            setCat(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{a.all || "All"}</option>
          {cats.data?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between px-1">
        <h2 className="text-[15px] font-bold">
          {km ? "សេវាផ្តាច់មុខ" : "Featured products"}
        </h2>
        <span className="text-[12px] text-muted">
          {data ? `${data.total} ${km ? "ធាតុ" : "items"}` : "…"}
        </span>
      </div>

      {error ? (
        <ErrorBox onRetry={reload} />
      ) : loading || !data ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-[20px]" />
          ))}
        </div>
      ) : data.services.length ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {data.services.map((s, i) => (
              <Card key={s.id} s={s} idx={i} />
            ))}
          </div>
          <Pager page={page} total={data.total} size={SIZE} onChange={setPage} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <PremiumIcon name="spark" size={16} active />
          <Empty text={a.empty} />
        </div>
      )}
    </div>
  );
}
