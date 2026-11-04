import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { hit } from "@/lib/rateLimit";
import { audit } from "../audit/log";
import { AdminCtx, can, loadAdmin } from "./auth";
import { Ctx, show, answer, del, esc, back, Btn, sendCustomerStart, miniAppUrl } from "./ui";
import { Action, getState, setState, clearState, newToken } from "./state";
import { overview } from "./overview";
import * as P from "./providers";
import * as S from "./services";
import { routeExtra, extraInput, runMore, permFor, backFor, entityFor } from "./more";

const CB = /^[a-z]{1,4}(:[A-Za-z0-9_-]{1,32}){0,3}$/;
const need: Record<string, string> = { prv: "providers.manage", svc: "services.manage", cat: "services.manage", ord: "orders.manage", usr: "users.view", pay: "payments.view", tkt: "tickets.manage", set: "settings.manage", rep: "reports.view", log: "audit.view" };

async function home(c: Ctx, a: AdminCtx) {
  const r: Btn[][] = [];
  const app = miniAppUrl();
  if (app) r.push([{ text: "🚀 Open Mini App", web_app: { url: app } }]);
  r.push([{ text: "📊 Overview", callback_data: "ov" }]);
  if (can(a, "services.manage")) r.push([{ text: "🛍️ Services Management", callback_data: "svc" }]);
  if (can(a, "providers.manage")) r.push([{ text: "🔌 Provider API", callback_data: "prv" }]);
  const m: [string, string, string][] = [["orders.manage", "📦 Orders", "ord"], ["users.view", "👥 Users", "usr"], ["payments.view", "💰 Wallet & Payments", "pay"], ["tickets.manage", "🎫 Tickets", "tkt"], ["settings.manage", "⚙️ Website Settings", "set"], ["reports.view", "📈 Sales & Profit", "rep"], ["audit.view", "🧾 Audit Logs", "log"]];
  for (const [perm, text, cbd] of m) if (can(a, perm)) r.push([{ text, callback_data: cbd }]);
  await show(c, "<b>ANGKER SMM ADMIN BOT</b>\nADMIN DASHBOARD", r);
}
async function askConfirm(c: Ctx, a: AdminCtx, action: Action, summary: string) {
  const token = newToken();
  await setState(a.telegramId, { confirm: { token, action, summary } });
  await show(c, `<b>Confirm</b>\n${esc(summary)}\n\n<i>Expires in 5 minutes.</i>`, [[{ text: "✅ Confirm", callback_data: `cf:${token}` }, { text: "✖️ Cancel", callback_data: "cx" }]]);
}
async function ask(c: Ctx, a: AdminCtx, kind: string, arg: string | undefined, prompt: string, backTo: string) {
  await setState(a.telegramId, { await: { kind, arg } });
  await show(c, prompt, [back(backTo)]);
}

export async function handleUpdate(u: any) {
  const msg = u.message, cb = u.callback_query;
  const tid = String(msg?.from?.id ?? cb?.from?.id ?? "");
  if (!tid) return;
  const cid = randomUUID();
  const admin = await loadAdmin(tid);
  if (!admin) {
    // Customer (non-admin): /start opens Mini App link
    const msg = u.message;
    if (msg?.text && /^\/(start|app|menu)(@\w+)?(\s|$)/i.test(msg.text)) {
      await sendCustomerStart(String(msg.chat.id));
      return;
    }
    if (await hit(`unauth:${tid}`, 3, 3600).catch(() => false)) await audit({ adminTelegramId: tid, action: "unauthorized_attempt", entityType: "Bot", result: "denied", cid }).catch(() => {});
    return;
  }
  // fail-open if RateLimit table is missing / DB is mid-setup — never silence a valid admin
  if (!(await hit(`adm:${tid}`, 60, 60).catch(() => true))) { if (cb) await answer(cb.id, "Slow down"); return; }

  const c: Ctx = { tid, chatId: String(msg?.chat?.id ?? cb.message?.chat?.id), msgId: cb?.message?.message_id, cid };
  try {
    if (cb) {
      await answer(cb.id);
      const data: string = cb.data ?? "";
      if (!CB.test(data)) return;
      const [p, x, y, z] = data.split(":");
      if (p === "home") { await clearState(tid); return home(c, admin); }
      if (p === "soon") return;
      if (p === "ov") return overview(c);
      if (p === "cx") { await clearState(tid); return home(c, admin); }
      if (p === "cf") return doConfirm(c, admin, x);
      const perm = need[p];
      if (!perm) return;
      if (!can(admin, perm)) { await audit({ adminTelegramId: tid, action: data, entityType: "Bot", result: "denied", cid }); return show(c, "⛔ Not permitted for your role.", [back()]); }
      await route(c, admin, p, x, y, z);
    } else if (msg?.text) {
      if (/^\/(start|menu)(@\w+)?(\s|$)/i.test(msg.text)) { await clearState(tid); return home(c, admin); }
      await handleInput(c, admin, msg);
    }
  } catch (e) {
    console.error("[bot]", e instanceof Error ? e.message : e);
    await audit({ adminTelegramId: tid, action: "bot_error", entityType: "Bot", reason: e instanceof Error ? e.message.slice(0, 80) : "error", result: "error", cid }).catch(() => {});
    await show({ ...c, msgId: undefined }, "⚠️ Something went wrong. Nothing was changed unless confirmed above.", [back()]);
  }
}

async function route(c: Ctx, a: AdminCtx, p: string, x?: string, y?: string, z?: string) {
  if (await routeExtra(c, a, p, x, y, z, { ask, confirm: askConfirm })) return;
  if (p === "prv") {
    if (!x) return P.listProviders(c);
    if (x === "v") return P.viewProvider(c, y!);
    if (x === "t") return P.testProvider(c, y!);
    if (x === "pv") return P.previewProvider(c, y!);
    if (x === "add") return ask(c, a, "prv.add", undefined, "Send one message:\n<code>Name|https://provider.api/v2|API_KEY</code>\n\nYour message is deleted after it is saved.", "prv");
    const names: Record<string, [string, string]> = { tg: ["prv.toggle", "Enable/disable this provider"], df: ["prv.def", "Make this the default provider"], sy: ["prv.sync", "Import/update services from provider (new ones start disabled)"] };
    if (names[x]) return askConfirm(c, a, { k: names[x][0], id: y! }, names[x][1]);
  }
  if (p === "svc") {
    if (!x) return S.listCategories(c);
    if (x === "l") return S.listServices(c, y!, Number(z ?? 0) || 0);
    if (x === "v") return S.viewService(c, y!);
    if (x === "tg") { const m = await S.runServiceAction("svc.toggle", y!); await audit({ adminTelegramId: a.telegramId, action: "svc.toggle", entityType: "Service", entityId: y, result: "ok", cid: c.cid }); await show(c, m, [back(`svc:v:${y}`)]); return; }
    if (x === "ar") return askConfirm(c, a, { k: "svc.archive", id: y! }, "Archive this service? It disappears from the site; past orders are kept.");
    if (x === "ct") return askConfirm(c, a, { k: "cat.toggle", id: y! }, "Enable/disable this category");
    if (x === "ca") return ask(c, a, "cat.add", undefined, "Send the new category name:", "svc");
    if (x === "ep") return ask(c, a, "svc.price", y, "Send the new selling price per 1000 (e.g. <code>0.85</code>):", `svc:v:${y}`);
    if (x === "en") return ask(c, a, "svc.name", y, "Send the new service name:", `svc:v:${y}`);
    if (x === "em") return ask(c, a, "svc.minmax", y, "Send <code>min max</code> (e.g. <code>100 10000</code>):", `svc:v:${y}`);
  }
}

async function doConfirm(c: Ctx, a: AdminCtx, token: string) {
  const st = await getState(a.telegramId);
  await clearState(a.telegramId);                // one-shot: a repeated tap finds nothing to run
  if (!st.confirm || st.confirm.token !== token) return show(c, "This confirmation expired or was already used.", [back()]);
  const { k, id, v } = st.confirm.action;
  if (!can(a, permFor(k))) return show(c, "⛔ Not permitted.", [back()]);
  let msg: string, result: "ok" | "error" = "ok";
  try { msg = k.startsWith("prv") ? await P.runProviderAction(k, id) : (k.startsWith("svc") || k.startsWith("cat")) ? await S.runServiceAction(k, id, v) : await runMore(k, id, v); }
  catch (e) { result = "error"; msg = `❌ Failed: ${e instanceof Error ? e.message.slice(0, 80) : "error"}`; }
  await audit({ adminTelegramId: a.telegramId, action: k, entityType: entityFor(k), entityId: id, reason: v ? `value=${v.slice(0, 200)}` : undefined, result, cid: c.cid });
  await show(c, msg, [back(backFor(k, id))]);
}

async function handleInput(c: Ctx, a: AdminCtx, msg: any) {
  const st = await getState(a.telegramId);
  if (!st.await) return home(c, a);
  const { kind, arg } = st.await, text: string = msg.text.trim();
  await clearState(a.telegramId);
  if (kind === "prv.add") {
    await del(c.chatId, msg.message_id);         // remove the API key from the chat
    if (!can(a, "providers.manage")) return;
    const id = await P.addProvider(text).catch(() => null);
    await audit({ adminTelegramId: a.telegramId, action: "prv.add", entityType: "Provider", entityId: id ?? undefined, result: id ? "ok" : "error", cid: c.cid }); // no key/URL logged
    return show({ ...c, msgId: undefined }, id ? "✅ Provider added. Open it to test the connection." : "❌ Invalid format. Use Name|https://url|key", [back("prv")]);
  }
  if (await extraInput(c, a, kind, arg, text, { ask, confirm: askConfirm })) return;
  if (!can(a, "services.manage")) return;
  if (kind === "cat.add") { const x = await S.addCategory(text); await audit({ adminTelegramId: a.telegramId, action: "cat.add", entityType: "Category", entityId: x.id, result: "ok", cid: c.cid }); return show({ ...c, msgId: undefined }, "✅ Category added.", [back("svc")]); }
  if (kind === "svc.price") {
    const n = Number(text);
    if (!(n >= 0 && n < 100000)) return show({ ...c, msgId: undefined }, "❌ Invalid price.", [back(`svc:v:${arg}`)]);
    const s = await db.service.findUnique({ where: { id: arg } });
    if (!s) return;
    const warn = n < Number(s.costPrice) ? "\n⚠️ Below provider cost — you will lose money per order." : "";
    return askConfirm({ ...c, msgId: undefined }, a, { k: "svc.price", id: arg!, v: String(n) }, `Price: $${s.sellPrice} → $${n} per 1000${warn}`);
  }
  if (kind === "svc.name" && text.length >= 2) return askConfirm({ ...c, msgId: undefined }, a, { k: "svc.name", id: arg!, v: text }, `Rename to: ${text.slice(0, 120)}`);
  if (kind === "svc.minmax") {
    const [mn, mx] = text.split(/\s+/).map(Number);
    if (!(Number.isInteger(mn) && Number.isInteger(mx) && mn > 0 && mx >= mn)) return show({ ...c, msgId: undefined }, "❌ Use: min max", [back(`svc:v:${arg}`)]);
    return askConfirm({ ...c, msgId: undefined }, a, { k: "svc.minmax", id: arg!, v: `${mn} ${mx}` }, `Limits → min ${mn}, max ${mx}`);
  }
}
