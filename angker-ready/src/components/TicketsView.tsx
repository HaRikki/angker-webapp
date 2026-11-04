"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { dt } from "@/lib/format";
import { useI18n, useToast } from "./Providers";
import { Skeleton, ErrorBox, Empty, Pager, Modal } from "./kit";

const TONE: Record<string, string> = { OPEN: "bg-cyan/15 text-cyan", IN_PROGRESS: "bg-cyan/15 text-cyan", WAITING_USER: "bg-amber-500/15 text-amber-500", RESOLVED: "bg-emerald-500/15 text-emerald-500", CLOSED: "bg-slate-500/15 text-muted" };
function TBadge({ s }: { s: string }) { const { t } = useI18n(); return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[s] ?? ""}`}>{t.app.tkt.status[s] ?? s}</span>; }
const CATS = ["order", "payment", "account", "other"], SIZE = 12;
async function send(url: string, body: unknown, method = "POST") {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  return { ok: !!r?.ok, d: (await r?.json().catch(() => ({}))) ?? {} };
}

export function TicketsList() {
  const { t } = useI18n(), k = t.app.tkt, toast = useToast(), router = useRouter(), [page, setPage] = useState(1), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const { data, loading, error, reload } = useApi<{ tickets: { id: string; category: string; subject: string; status: string; createdAt: string }[]; total: number }>(`/api/user/tickets?page=${page}&pageSize=${SIZE}`);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (busy) return; const f = new FormData(e.currentTarget); setBusy(true); setErr("");
    const r = await send("/api/user/tickets", { category: f.get("category"), subject: String(f.get("subject")).trim(), message: String(f.get("message")).trim() });
    setBusy(false);
    if (r.ok) { toast.push(k.sent); router.push(`/tickets/${r.d.ticket.id}`); return; }
    const m = t.app.err[r.d?.error as string] ?? t.errors.generic; setErr(m); toast.push(m, "err");
  }
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3"><h1 className="tg-title">{k.title}</h1><button className="btn-primary" onClick={() => { setErr(""); setOpen(true); }}><Plus className="h-4 w-4" />{k.new}</button></div>
      {error ? <ErrorBox onRetry={reload} /> : loading || !data ? <div className="glass space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div>
        : data.tickets.length ? <><ul className="glass divide-y divide-line/60">{data.tickets.map((x) => <li key={x.id}><Link href={`/tickets/${x.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-surface/60"><span className="min-w-0"><span className="block truncate font-medium">{x.subject}</span><span className="text-xs text-muted">{k.cats[x.category] ?? x.category} · {dt(x.createdAt)}</span></span><TBadge s={x.status} /></Link></li>)}</ul><Pager page={page} total={data.total} size={SIZE} onChange={setPage} /></>
        : <div className="glass"><Empty text={k.empty} /></div>}
      {open && <Modal title={k.new} onClose={() => !busy && setOpen(false)}>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm font-medium">{k.category}<select name="category" className="input mt-1.5">{CATS.map((c) => <option key={c} value={c}>{k.cats[c]}</option>)}</select></label>
          <label className="block text-sm font-medium">{k.subject}<input name="subject" className="input mt-1.5" required minLength={3} maxLength={120} /></label>
          <label className="block text-sm font-medium">{k.message}<textarea name="message" className="input mt-1.5 min-h-[8rem]" required minLength={3} maxLength={4000} /></label>
          {err && <p role="alert" className="text-sm text-red-500">{err}</p>}
          <div className="flex gap-3"><button type="button" className="btn-ghost flex-1" disabled={busy} onClick={() => setOpen(false)}>{k.cancel}</button><button className="btn-primary flex-1" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{k.submit}</button></div>
        </form></Modal>}
    </div>
  );
}

export function TicketDetail({ id }: { id: string }) {
  const { t } = useI18n(), k = t.app.tkt, toast = useToast(), [busy, setBusy] = useState(false), [text, setText] = useState("");
  const { data, loading, error, reload } = useApi<{ ticket: { id: string; category: string; subject: string; status: string; createdAt: string; messages: { id: string; fromAdmin: boolean; body: string; createdAt: string }[] } }>(`/api/user/tickets/${encodeURIComponent(id)}`);
  const back = <Link href="/tickets" className="btn-ghost"><ArrowLeft className="h-4 w-4" />{k.back}</Link>;
  if (error) return <div className="space-y-4">{back}<ErrorBox onRetry={reload} /></div>;
  if (loading || !data) return <div className="glass space-y-3 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  const tk = data.ticket;
  async function reply(e: FormEvent) {
    e.preventDefault(); if (busy || !text.trim()) return; setBusy(true);
    const r = await send(`/api/user/tickets/${encodeURIComponent(id)}/replies`, { message: text.trim() });
    setBusy(false);
    if (r.ok) { setText(""); toast.push(k.replied); reload(); } else toast.push(t.app.err[r.d?.error as string] ?? t.errors.generic, "err");
  }
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {back}
      <div className="glass p-5"><div className="flex items-start justify-between gap-3"><h1 className="text-lg font-bold">{tk.subject}</h1><TBadge s={tk.status} /></div><p className="mt-1 text-xs text-muted">{k.cats[tk.category] ?? tk.category} · {k.created} {dt(tk.createdAt)}</p></div>
      <ul className="space-y-3">{tk.messages.map((m) => <li key={m.id} className={`flex ${m.fromAdmin ? "" : "justify-end"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.fromAdmin ? "glass" : "bg-cyan/15"}`}><div className="mb-1 text-xs font-semibold text-muted">{m.fromAdmin ? k.staff : k.you} · {dt(m.createdAt)}</div><p className="whitespace-pre-wrap break-words">{m.body}</p></div></li>)}</ul>
      {tk.status === "CLOSED" ? <p className="text-center text-sm text-muted">{k.closed}</p> : <form onSubmit={reply} className="glass space-y-3 p-4"><textarea className="input min-h-[6rem]" placeholder={k.replyPh} aria-label={k.reply} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} /><button className="btn-primary" disabled={busy || !text.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{k.reply}</button></form>}
    </div>
  );
}
