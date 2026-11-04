"use client";
import { FormEvent, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { dt } from "@/lib/format";
import { useI18n, useToast } from "./Providers";
import { Skeleton, ErrorBox } from "./kit";

type Key = { prefix: string; enabled: boolean; ipWhitelist: string[]; lastUsedAt: string | null; createdAt: string };
const json = { "Content-Type": "application/json" };

const ACTIONS: { action: string; params: string; resp: string }[] = [
  { action: "services", params: "key, action=services", resp: `[ { "service": 1, "name": "Instagram Followers", "type": "Default", "category": "Instagram", "rate": "0.9000", "min": "100", "max": "10000", "refill": false, "cancel": false } ]` },
  { action: "add", params: "key, action=add, service, link, quantity", resp: `{ "order": 23501 }` },
  { action: "status", params: "key, action=status, order", resp: `{ "charge": "0.2780", "start_count": "0", "status": "Pending", "remains": "0", "currency": "USD" }` },
  { action: "status (many)", params: "key, action=status, orders=1,2,3  (max 100)", resp: `{ "1": { "charge": "0.2780", "start_count": "0", "status": "Completed", "remains": "0", "currency": "USD" }, "2": { "error": "Incorrect order ID" } }` },
  { action: "balance", params: "key, action=balance", resp: `{ "balance": "100.8400", "currency": "USD" }` },
];

export function ApiAccessView() {
  const { t } = useI18n(), a = t.app.api, toast = useToast();
  const { data, loading, error, reload } = useApi<{ key: Key | null }>("/api/user/api-key");
  const [pw, setPw] = useState(""), [busy, setBusy] = useState(false), [pwErr, setPwErr] = useState(""), [fresh, setFresh] = useState("");
  const [ips, setIps] = useState(""), [ipErr, setIpErr] = useState(""), [origin, setOrigin] = useState("https://your-domain");
  const key = data?.key ?? null;
  useEffect(() => setOrigin(location.origin), []);
  useEffect(() => { if (key) setIps(key.ipWhitelist.join("\n")); }, [key?.prefix, key?.ipWhitelist.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(e: FormEvent) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setPwErr("");
    const r = await fetch("/api/user/api-key", { method: "POST", headers: json, body: JSON.stringify({ password: pw }) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setBusy(false);
    if (r?.ok) { setFresh(d.apiKey); setPw(""); reload(); return; }
    if (d?.error === "FORBIDDEN") setPwErr(a.wrongPw); else toast.push(t.errors.generic, "err");
  }
  async function patch(body: object, ok?: string) {
    const r = await fetch("/api/user/api-key", { method: "PATCH", headers: json, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) { if (ok) toast.push(ok); reload(); return true; }
    return false;
  }
  async function saveIps() {
    setIpErr("");
    const list = ips.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!(await patch({ ipWhitelist: list }, a.saved))) setIpErr(a.badIp);
  }
  async function revoke() {
    if (!confirm(a.revokeAsk)) return;
    const r = await fetch("/api/user/api-key", { method: "DELETE" }).catch(() => null);
    if (r?.ok) { setFresh(""); reload(); } else toast.push(t.errors.generic, "err");
  }
  const copy = (v: string) => navigator.clipboard?.writeText(v).then(() => toast.push(a.copied)).catch(() => {});
  const url = `${origin}/api/v2`;
  const curl = `curl -X POST ${url} \\\n  -d key=YOUR_API_KEY -d action=add \\\n  -d service=1 -d link=https://example.com/post -d quantity=1000`;
  const py = `import requests\nr = requests.post("${url}", data={\n    "key": "YOUR_API_KEY", "action": "add",\n    "service": 1, "link": "https://example.com/post", "quantity": 1000})\nprint(r.json())   # {"order": 23501}`;
  const php = `<?php\n$ch = curl_init("${url}");\ncurl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_POSTFIELDS => ["key" => "YOUR_API_KEY", "action" => "services"]]);\necho curl_exec($ch);`;

  return (
    <div className="space-y-4">
      <div><h1 className="tg-title">{a.title}</h1><p className="mt-1 text-sm text-muted">{a.intro}</p></div>

      <div className="glass space-y-4 p-6">
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-cyan" />{a.keyTitle}</h2>
        {error ? <ErrorBox onRetry={reload} /> : loading && !data ? <Skeleton className="h-10" /> : (
          <>
            {fresh && (
              <div role="status" className="space-y-2 rounded-xl border border-cyan/40 bg-cyan/10 p-4">
                <p className="text-sm font-medium">{a.showOnce}</p>
                <div className="flex items-center gap-2"><code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-3 py-2 text-sm">{fresh}</code>
                  <button type="button" className="btn-ghost" onClick={() => copy(fresh)}><Copy className="h-4 w-4" />{a.copy}</button></div>
              </div>
            )}
            {key ? (
              <dl className="divide-y divide-line/60 text-sm">
                {([[a.keyTitle, <code key="k">{key.prefix}••••••••••••••••••••••••••••••••••••</code>], [a.status, key.enabled ? a.enabled : a.disabled], [a.created, dt(key.createdAt)], [a.lastUsed, key.lastUsedAt ? dt(key.lastUsedAt) : a.never]] as const).map(([k, v], i) => (
                  <div key={i} className="flex justify-between gap-4 py-2.5"><dt className="text-muted">{k}</dt><dd className="break-all text-right">{v}</dd></div>
                ))}
              </dl>
            ) : <p className="text-sm text-muted">{a.none}</p>}
            <form onSubmit={generate} className="space-y-2" noValidate>
              <label htmlFor="apw" className="block text-sm font-medium">{a.confirmPw}</label>
              <input id="apw" type="password" className={`input ${pwErr ? "!border-red-500" : ""}`} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" maxLength={128} required />
              {pwErr ? <p className="text-xs text-red-500">{pwErr}</p> : key ? <p className="text-xs text-muted">{a.pwHint}</p> : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button className="btn-primary" disabled={busy || !pw}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{key ? a.regenerate : a.generate}</button>
                {key && <button type="button" className="btn-ghost" onClick={() => patch({ enabled: !key.enabled })}>{key.enabled ? a.disabled : a.enabled}</button>}
                {key && <button type="button" className="btn-ghost text-red-400" onClick={revoke}>{a.revoke}</button>}
              </div>
            </form>
          </>
        )}
      </div>

      {key && (
        <div className="glass space-y-3 p-6">
          <h2 className="font-semibold">{a.ipTitle}</h2>
          <textarea className="input min-h-[96px] font-mono text-sm" value={ips} onChange={(e) => setIps(e.target.value)} placeholder="203.0.113.10" aria-label={a.ipTitle} />
          <p className="text-xs text-muted">{ipErr ? <span className="text-red-500">{ipErr}</span> : a.ipHint}</p>
          <button type="button" className="btn-primary" onClick={saveIps}>{a.save}</button>
        </div>
      )}

      <div className="glass space-y-5 p-6">
        <h2 className="font-semibold">{a.docs}</h2>
        <dl className="divide-y divide-line/60 text-sm">
          <div className="flex justify-between gap-4 py-2.5"><dt className="text-muted">{a.endpoint}</dt><dd className="flex items-center gap-2 break-all text-right"><code>{url}</code><button type="button" aria-label={a.copy} onClick={() => copy(url)}><Copy className="h-4 w-4" /></button></dd></div>
          <div className="flex justify-between gap-4 py-2.5"><dt className="text-muted">{a.method}</dt><dd><code>POST</code> (form-data, x-www-form-urlencoded or JSON)</dd></div>
        </dl>
        <p className="text-xs text-muted">{a.limits}</p>
        {ACTIONS.map((x) => (
          <div key={x.action} className="space-y-1.5">
            <div className="text-sm font-medium"><code>{x.action}</code></div>
            <div className="text-xs text-muted">{x.params}</div>
            <pre className="overflow-x-auto rounded-lg bg-surface p-3 text-xs">{x.resp}</pre>
          </div>
        ))}
        <div className="space-y-1.5 text-sm">
          <div className="font-medium">Order status</div>
          <p className="text-xs text-muted">Pending · Processing · In progress · Completed · Partial · Canceled (failed orders are refunded automatically and reported as Canceled)</p>
          <div className="font-medium pt-2">Errors</div>
          <p className="text-xs text-muted">Every error is <code>{`{ "error": "message" }`}</code>: Incorrect API key (401) · API key is disabled / IP address is not allowed (403) · Not enough funds on balance (402) · Incorrect service ID / link / quantity (400) · Too many requests (429). Service IDs are the numbers on the Services page. Refill and cancel are not available.</p>
        </div>
        {([["cURL", curl], ["Python", py], ["PHP", php]] as const).map(([n, c]) => (
          <div key={n} className="space-y-1.5"><div className="flex items-center justify-between text-sm font-medium">{n}<button type="button" className="btn-ghost text-xs" onClick={() => copy(c)}><Copy className="h-3.5 w-3.5" />{a.copy}</button></div>
            <pre className="overflow-x-auto rounded-lg bg-surface p-3 text-xs">{c}</pre></div>
        ))}
      </div>
    </div>
  );
}
