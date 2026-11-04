"use client";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { money, dt } from "@/lib/format";
import { useI18n } from "./Providers";
import { Skeleton, ErrorBox, Empty, Pager } from "./kit";
import { useState } from "react";

type Tx = { id: string; type: string; amount: string; description: string; createdAt: string };

export function TransactionsView() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const SIZE = 20;
  const { data, loading, error, reload } = useApi<{ transactions: Tx[]; total: number }>(
    `/api/user/transactions?page=${page}&pageSize=${SIZE}`
  );

  return (
    <div className="space-y-3">
      <h1 className="tg-title">{t.app.nav.tx}</h1>
      {error ? (
        <ErrorBox onRetry={reload} />
      ) : loading || !data ? (
        <div className="tg-section">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="tg-cell"><Skeleton className="h-8 w-full" /></div>)}</div>
      ) : data.transactions.length ? (
        <>
          <div className="tg-section">
            {data.transactions.map((x) => {
              const neg = Number(x.amount) < 0;
              return (
                <div key={x.id} className="tg-cell">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${neg ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"}`}>
                    {neg ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.app.txType[x.type] ?? x.type}</div>
                    <div className="text-[12px] text-muted">{dt(x.createdAt)}</div>
                  </div>
                  <b className={`tabular-nums ${neg ? "text-red-500" : "text-emerald-500"}`}>
                    {neg ? "" : "+"}{money(x.amount)}
                  </b>
                </div>
              );
            })}
          </div>
          <Pager page={page} total={data.total} size={SIZE} onChange={setPage} />
        </>
      ) : (
        <div className="tg-section"><Empty text={t.app.dash.noTx} /></div>
      )}
    </div>
  );
}
