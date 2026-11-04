import { randomUUID } from "node:crypto";
import { OrderStatus, DepositStatus, TicketStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { applyLedger } from "../wallet/ledger";
import { refundOrder } from "../orders/createOrder";
import { syncOne } from "../orders/syncStatus";
import { settleDeposit } from "../payments/deposits";
import { audit } from "../audit/log";
import { Ctx, show, esc, back, Btn } from "./ui";
import { AdminCtx, can } from "./auth";
import { Action } from "./state";

export type H = { ask: (c: Ctx, a: AdminCtx, kind: string, arg: string | undefined, prompt: string, backTo: string) => Promise<void>;
  confirm: (c: Ctx, a: AdminCtx, action: Action, summary: string) => Promise<void> };
const PS = 8, ts = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");
const pager = (base: string, pg: number, total: number): Btn[] => { const r: Btn[] = [];
  if (pg > 0) r.push({ text: "◀️", callback_data: `${base}:${pg - 1}` }); if ((pg + 1) * PS < total) r.push({ text: "▶️", callback_data: `${base}:${pg + 1}` }); return r; };
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const setting = async <T,>(k: string, d: T) => ((await db.siteSetting.findUnique({ where: { key: k } }))?.value as unknown as T) ?? d;
const setSetting = (key: string, value: Prisma.InputJsonValue) => db.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });

export const permFor = (k: string) => ({ prv: "providers.manage", svc: "services.manage", cat: "services.manage", ord: "orders.manage", set: "settings.manage" } as Record<string, string>)[k.slice(0, 3)]
  ?? (k === "usr.adjust" ? "wallet.adjust" : k.startsWith("usr") ? "users.manage" : "never");
export const backFor = (k: string, id: string) => k.startsWith("prv") ? `prv:v:${id}` : k.startsWith("ord") ? `ord:v:${id}` : k.startsWith("usr") ? `usr:v:${id}` : k.startsWith("set") ? "set" : "svc";
export const entityFor = (k: string) => ({ prv: "Provider", svc: "Service", cat: "Category", ord: "Order", usr: "User", set: "Setting" } as Record<string, string>)[k.slice(0, 3)] ?? "Other";

// ---------- Orders ----------
const ORD_ST = ["PENDING", "PROCESSING", "IN_PROGRESS", "COMPLETED", "PARTIAL", "CANCELLED", "FAILED"];
async function ordList(c: Ctx, st: string, pg: number) {
  const where: Prisma.OrderWhereInput = st === "ALL" ? {} : { status: st as OrderStatus };
  const [total, os] = await Promise.all([db.order.count({ where }), db.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg * PS, take: PS })]);
  const rows: Btn[][] = os.map((o) => [{ text: `${o.status.slice(0, 4)} · ${o.serviceName.slice(0, 26)} · $${o.sellPrice}`, callback_data: `ord:v:${o.id}` }]);
  const nav = pager(`ord:l:${st}`, pg, total); if (nav.length) rows.push(nav);
  await show(c, `<b>📦 Orders — ${st}</b> (${total})`, [...rows, back("ord")]);
}
async function ordView(c: Ctx, id: string) {
  const o = await db.order.findUnique({ where: { id }, include: { user: true, events: { orderBy: { createdAt: "desc" }, take: 8 } } });
  if (!o) return show(c, "Order not found.", [back("ord")]);
  const t = `<b>Order</b> <code>${o.id}</code>\n${esc(o.serviceName)}\nTarget: ${esc(o.target)}\nQty: ${o.quantity}  Price: $${o.sellPrice}  Cost: $${o.providerCost}\nStatus: <b>${o.status}</b>  Provider ref: ${esc(o.providerRef ?? "—")}\nUser: ${esc(o.user.username)}\nCreated: ${ts(o.createdAt)}\n\n<b>Timeline</b>\n${o.events.map((e) => `• ${ts(e.createdAt)} ${esc(e.kind)}`).join("\n") || "—"}`;
  const rows: Btn[][] = [];
  if (o.providerRef) rows.push([{ text: "🔄 Refresh status", callback_data: `ord:rf:${id}` }]);
  if (!o.providerRef && o.status === "PENDING") rows.push([{ text: "🔁 Retry submit", callback_data: `ord:rt:${id}` }]);
  if (!o.providerRef && o.status === "PROCESSING") rows.push([{ text: "🔗 Link provider order", callback_data: `ord:lk:${id}` }, { text: "↩️ Refund (no order at provider)", callback_data: `ord:rm:${id}` }]);
  await show(c, t, [...rows, [{ text: "👤 User", callback_data: `usr:v:${o.userId}` }], back("ord")]);
}
// ---------- Users ----------
async function usrView(c: Ctx, id: string) {
  const u = await db.user.findUnique({ where: { id }, include: { wallet: true, _count: { select: { orders: true, deposits: true, tickets: true } } } });
  if (!u) return show(c, "User not found.", [back("usr")]);
  const rows: Btn[][] = [[{ text: "🧾 Transactions", callback_data: `usr:tx:${id}` }, { text: "📦 Orders", callback_data: `ord:u:${id}:0` }]];
  rows.push([{ text: u.status === "ACTIVE" ? "🚫 Suspend" : "✅ Unsuspend", callback_data: `usr:su:${id}` }, { text: "➕➖ Adjust balance", callback_data: `usr:ad:${id}` }], back("usr"));
  await show(c, `<b>${esc(u.username)}</b>\n${esc(u.email)}\nID: <code>${u.id}</code>\nStatus: ${u.status}\nBalance: <b>$${u.wallet?.balance ?? 0}</b>\nOrders: ${u._count.orders}  Deposits: ${u._count.deposits}  Tickets: ${u._count.tickets}\nJoined: ${ts(u.createdAt)}`, rows);
}
// ---------- Payments ----------
async function payList(c: Ctx, st: string, pg: number) {
  const where = { status: st as DepositStatus };
  const [total, ds] = await Promise.all([db.deposit.count({ where }), db.deposit.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg * PS, take: PS, include: { user: true } })]);
  const rows: Btn[][] = ds.map((d) => [{ text: `$${d.amount} · ${d.user.username} · ${ts(d.createdAt)}`, callback_data: `pay:v:${d.id}` }]);
  const nav = pager(`pay:l:${st}`, pg, total); if (nav.length) rows.push(nav);
  await show(c, `<b>💰 Deposits — ${st}</b> (${total})`, [...rows, back("pay")]);
}
// ---------- Tickets ----------
async function tktView(c: Ctx, id: string) {
  const t = await db.supportTicket.findUnique({ where: { id }, include: { user: true, messages: { orderBy: { createdAt: "desc" }, take: 6 } } });
  if (!t) return show(c, "Ticket not found.", [back("tkt")]);
  const m = t.messages.reverse().map((x) => `${x.fromAdmin ? "🛠 Admin" : "👤 User"} (${ts(x.createdAt)}):\n${esc(x.body.slice(0, 400))}`).join("\n\n");
  await show(c, `<b>🎫 ${esc(t.subject)}</b>\n${esc(t.user.username)} · ${t.category} · <b>${t.status}</b>\n\n${m || "—"}`, [
    [{ text: "💬 Reply", callback_data: `tkt:r:${id}` }],
    [{ text: "⏳ In progress", callback_data: `tkt:s:${id}:IN_PROGRESS` }, { text: "✅ Resolved", callback_data: `tkt:s:${id}:RESOLVED` }, { text: "🔒 Close", callback_data: `tkt:s:${id}:CLOSED` }], back("tkt")]);
}
// ---------- Settings / Reports / Logs ----------
async function settingsView(c: Ctx) {
  const [name, min, max, mt, reg, pm] = await Promise.all([setting("siteName", "AngKer SMM"), setting("minDeposit", 1), setting("maxDeposit", 500), setting("maintenance", false), setting("registrationEnabled", true), setting<string[]>("paymentMethods", ["aba"])]);
  await show(c, `<b>⚙️ Website Settings</b>\nName: ${esc(name)}\nDeposit: $${min} – $${max}\nMaintenance: ${mt ? "ON" : "off"}\nRegistration: ${reg ? "open" : "closed"}\nABA KHQR: ${pm.includes("aba") ? "enabled" : "disabled"}`, [
    [{ text: "🛠 Maintenance", callback_data: "set:mt" }, { text: "🆕 Registration", callback_data: "set:rg" }, { text: "💳 ABA", callback_data: "set:aba" }],
    [{ text: "Min deposit", callback_data: "set:mn" }, { text: "Max deposit", callback_data: "set:mx" }, { text: "Site name", callback_data: "set:nm" }], back()]);
}
async function report(c: Ctx, days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [s, rf, dp, uncertain, mism] = await Promise.all([
    db.order.aggregate({ where: { status: "COMPLETED", createdAt: { gte: since } }, _sum: { sellPrice: true, providerCost: true }, _count: true }),
    db.walletTransaction.aggregate({ where: { type: "REFUND", createdAt: { gte: since } }, _sum: { amount: true } }),
    db.deposit.aggregate({ where: { status: "PAID", paidAt: { gte: since } }, _sum: { amount: true } }),
    db.order.count({ where: { status: "PROCESSING", providerRef: null } }),
    db.paymentEvent.count({ where: { verified: false } })]);
  const sell = Number(s._sum.sellPrice ?? 0), cost = Number(s._sum.providerCost ?? 0);
  await show(c, `<b>📈 Report — last ${days} day(s)</b>\nCompleted orders: ${s._count}\nSales: $${sell.toFixed(2)}\nProvider cost (stored at order time): $${cost.toFixed(2)}\nRefunds: $${Number(rf._sum.amount ?? 0).toFixed(2)}\nDeposits: $${Number(dp._sum.amount ?? 0).toFixed(2)}\nEst. gross profit: <b>$${(sell - cost).toFixed(2)}</b> <i>(not net)</i>\n\n<b>Needs attention</b>\nOrders with unknown provider result: ${uncertain}\nPayment amount mismatches: ${mism}`,
    [[{ text: "Today", callback_data: "rep:d:1" }, { text: "7 days", callback_data: "rep:d:7" }, { text: "30 days", callback_data: "rep:d:30" }], back()]);
}
async function logs(c: Ctx, pg: number) {
  const [total, ls] = await Promise.all([db.auditLog.count(), db.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: pg * 10, take: 10 })]);
  const nav = pager("log:l", pg, total * (PS / 10) | 0 || total);
  await show(c, `<b>🧾 Audit Logs</b>\n` + ls.map((l) => `${ts(l.createdAt)} ${l.result === "ok" ? "✅" : "❌"} ${esc(l.action)} ${esc(l.entityType)} · ${esc(l.adminTelegramId)}`).join("\n"), [nav.length ? nav : [], back()].filter((r) => r.length));
}

// ---------- routing ----------
export async function routeExtra(c: Ctx, a: AdminCtx, p: string, x: string | undefined, y: string | undefined, z: string | undefined, h: H): Promise<boolean> {
  if (p === "ord") {
    if (!x) { await show(c, "<b>📦 Orders</b>", [...chunk([{ text: "All", callback_data: "ord:l:ALL:0" }, ...ORD_ST.map((s) => ({ text: s, callback_data: `ord:l:${s}:0` }))], 2), [{ text: "🔎 Search ID / user", callback_data: "ord:f" }], back()]); return true; }
    if (x === "l") { await ordList(c, y!, Number(z) || 0); return true; }
    if (x === "v") { await ordView(c, y!); return true; }
    if (x === "u") { const where = { userId: y! }; const os = await db.order.findMany({ where, orderBy: { createdAt: "desc" }, take: PS, skip: (Number(z) || 0) * PS });
      await show(c, "<b>User orders</b>", [...os.map((o) => [{ text: `${o.status.slice(0, 4)} · ${o.serviceName.slice(0, 28)}`, callback_data: `ord:v:${o.id}` }]), back(`usr:v:${y}`)]); return true; }
    if (x === "f") { await h.ask(c, a, "ord.find", undefined, "Send an order ID, user ID or username:", "ord"); return true; }
    if (x === "rf") { try { await syncOne(y!); } catch { /* shown below */ } await ordView(c, y!); return true; }
    if (x === "rt") { await h.confirm(c, a, { k: "ord.retry", id: y! }, "Queue this PENDING order for provider submission again."); return true; }
    if (x === "lk") { await h.ask(c, a, "ord.link", y, "Send the provider's order number (verify it in the provider panel first):", `ord:v:${y}`); return true; }
    if (x === "rm") { await h.confirm(c, a, { k: "ord.refund", id: y! }, "Refund the user and mark FAILED. Only do this if you confirmed the provider has NO such order."); return true; }
  }
  if (p === "usr") {
    if (!x) { await h.ask(c, a, "usr.find", undefined, "Send a username, email or user ID:", "home"); return true; }
    if (x === "v") { await usrView(c, y!); return true; }
    if (x === "tx") { const ts_ = await db.walletTransaction.findMany({ where: { userId: y }, orderBy: { createdAt: "desc" }, take: 10 });
      await show(c, "<b>Last transactions</b>\n" + ts_.map((t) => `${ts(t.createdAt)} ${t.type} ${t.amount} → ${t.balanceAfter}`).join("\n"), [back(`usr:v:${y}`)]); return true; }
    if (x === "su") { const u = await db.user.findUnique({ where: { id: y } }); if (!u) return true; await h.confirm(c, a, { k: u.status === "ACTIVE" ? "usr.suspend" : "usr.unsuspend", id: y! }, `${u.status === "ACTIVE" ? "Suspend" : "Unsuspend"} ${u.username}`); return true; }
    if (x === "ad") { await h.ask(c, a, "usr.adj", y, "Send: <code>credit|debit amount reason</code>\ne.g. <code>credit 5.00 compensation for failed order</code>", `usr:v:${y}`); return true; }
  }
  if (p === "pay") {
    if (!x) { await show(c, "<b>💰 Wallet & Payments</b>", [[{ text: "⏳ Pending", callback_data: "pay:l:PENDING:0" }, { text: "✅ Paid", callback_data: "pay:l:PAID:0" }], [{ text: "⌛ Expired", callback_data: "pay:l:EXPIRED:0" }, { text: "❌ Failed", callback_data: "pay:l:FAILED:0" }], [{ text: "🔎 Search reference", callback_data: "pay:f" }, { text: "📒 Ledger", callback_data: "pay:lg:0" }], back()]); return true; }
    if (x === "l") { await payList(c, y!, Number(z) || 0); return true; }
    if (x === "f") { await h.ask(c, a, "pay.find", undefined, "Send a payment reference:", "pay"); return true; }
    if (x === "lg") { const pg = Number(y) || 0; const [n, l] = await Promise.all([db.walletTransaction.count(), db.walletTransaction.findMany({ orderBy: { createdAt: "desc" }, skip: pg * 10, take: 10 })]);
      const nav = pager("pay:lg", pg, n); await show(c, "<b>📒 Wallet ledger</b>\n" + l.map((t) => `${ts(t.createdAt)} ${t.type} ${t.amount}`).join("\n"), [...(nav.length ? [nav] : []), back("pay")]); return true; }
    if (x === "v") { const d = await db.deposit.findUnique({ where: { id: y }, include: { user: true, events: true } }); if (!d) return true;
      await show(c, `<b>Deposit</b> $${d.amount} ${d.currency}\n${esc(d.user.username)} · ${d.status}\nRef: <code>${esc(d.reference)}</code>\nCreated: ${ts(d.createdAt)}${d.paidAt ? "\nPaid: " + ts(d.paidAt) : ""}\nEvents: ${d.events.map((e) => (e.verified ? "✔" : "✖") + e.eventId.split(":").pop()).join(" ") || "—"}\n\n<i>Payments are credited only after provider verification. There is no manual "mark paid".</i>`,
        [...(d.status === "PENDING" ? [[{ text: "🔄 Re-check with provider", callback_data: `pay:rc:${y}` }]] : []), back("pay")]); return true; }
    if (x === "rc") { try { await settleDeposit(y!); } catch { /* shown via status */ } const d = await db.deposit.findUnique({ where: { id: y } });
      await show(c, `Status: <b>${d?.status}</b>`, [back(`pay:v:${y}`)]); return true; }
  }
  if (p === "tkt") {
    if (!x) { await show(c, "<b>🎫 Tickets</b>", [[{ text: "Open", callback_data: "tkt:l:OPEN:0" }, { text: "In progress", callback_data: "tkt:l:IN_PROGRESS:0" }], [{ text: "Waiting user", callback_data: "tkt:l:WAITING_USER:0" }, { text: "Resolved", callback_data: "tkt:l:RESOLVED:0" }], back()]); return true; }
    if (x === "l") { const where = { status: y as TicketStatus }, pg = Number(z) || 0; const [n, ts_] = await Promise.all([db.supportTicket.count({ where }), db.supportTicket.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg * PS, take: PS, include: { user: true } })]);
      const nav = pager(`tkt:l:${y}`, pg, n); await show(c, `<b>🎫 ${y}</b> (${n})`, [...ts_.map((t) => [{ text: `${t.user.username} · ${t.subject.slice(0, 30)}`, callback_data: `tkt:v:${t.id}` }]), ...(nav.length ? [nav] : []), back("tkt")]); return true; }
    if (x === "v") { await tktView(c, y!); return true; }
    if (x === "r") { await h.ask(c, a, "tkt.reply", y, "Send your reply to the user:", `tkt:v:${y}`); return true; }
    if (x === "s" && z && z in TicketStatus) { await db.supportTicket.update({ where: { id: y }, data: { status: z as TicketStatus } });
      await audit({ adminTelegramId: a.telegramId, action: "tkt.status", entityType: "Ticket", entityId: y, reason: z, result: "ok", cid: c.cid }); await tktView(c, y!); return true; }
  }
  if (p === "set") {
    if (!x) { await settingsView(c); return true; }
    const T: Record<string, [string, string]> = { mt: ["set.maint", "Toggle maintenance mode"], rg: ["set.reg", "Toggle new-user registration"], aba: ["set.aba", "Enable/disable ABA KHQR deposits"] };
    if (T[x]) { await h.confirm(c, a, { k: T[x][0], id: "-" }, T[x][1]); return true; }
    const A: Record<string, [string, string]> = { mn: ["set.min", "Send the minimum deposit (USD):"], mx: ["set.max", "Send the maximum deposit (USD):"], nm: ["set.name", "Send the website name:"] };
    if (A[x]) { await h.ask(c, a, A[x][0], undefined, A[x][1], "set"); return true; }
  }
  if (p === "rep") { await report(c, x === "d" ? Math.min(Number(y) || 1, 365) : 1); return true; }
  if (p === "log") { await logs(c, x === "l" ? Number(y) || 0 : 0); return true; }
  return false;
}

const KIND_PERM: Record<string, string> = { "ord.find": "orders.manage", "ord.link": "orders.manage", "usr.find": "users.view", "usr.adj": "wallet.adjust", "pay.find": "payments.view", "tkt.reply": "tickets.manage", "set.min": "settings.manage", "set.max": "settings.manage", "set.name": "settings.manage" };
export async function extraInput(c: Ctx, a: AdminCtx, kind: string, arg: string | undefined, text: string, h: H): Promise<boolean> {
  const perm = KIND_PERM[kind]; if (!perm) return false;
  const c2 = { ...c, msgId: undefined };
  if (!can(a, perm)) { await show(c2, "⛔ Not permitted.", [back()]); return true; }
  if (kind === "ord.find") { const os = await db.order.findMany({ where: { OR: [{ id: text }, { userId: text }, { user: { username: text } }] }, take: PS, orderBy: { createdAt: "desc" } });
    await show(c2, os.length ? "<b>Results</b>" : "No orders found.", [...os.map((o) => [{ text: `${o.status.slice(0, 4)} · ${o.serviceName.slice(0, 28)}`, callback_data: `ord:v:${o.id}` }]), back("ord")]); return true; }
  if (kind === "usr.find") { const us = await db.user.findMany({ where: { OR: [{ id: text }, { username: { contains: text, mode: "insensitive" } }, { email: { contains: text.toLowerCase() } }] }, take: PS });
    await show(c2, us.length ? "<b>Users</b>" : "No users found.", [...us.map((u) => [{ text: `${u.username} · ${u.status}`, callback_data: `usr:v:${u.id}` }]), back()]); return true; }
  if (kind === "pay.find") { const d = await db.deposit.findUnique({ where: { reference: text } });
    await show(c2, d ? `Found: $${d.amount} · ${d.status}` : "Not found.", [...(d ? [[{ text: "Open", callback_data: `pay:v:${d.id}` }]] : []), back("pay")]); return true; }
  if (kind === "ord.link") { if (!/^[A-Za-z0-9_-]{1,40}$/.test(text)) { await show(c2, "❌ Invalid number.", [back(`ord:v:${arg}`)]); return true; }
    await h.confirm(c2, a, { k: "ord.link", id: arg!, v: text }, `Link this order to provider order #${text}`); return true; }
  if (kind === "usr.adj") { const m = /^(credit|debit)\s+(\d{1,6}(?:\.\d{1,2})?)\s+(.{3,200})$/i.exec(text);
    if (!m || Number(m[2]) <= 0) { await show(c2, "❌ Format: credit|debit amount reason", [back(`usr:v:${arg}`)]); return true; }
    const u = await db.user.findUnique({ where: { id: arg } }); if (!u) return true;
    await h.confirm(c2, a, { k: "usr.adjust", id: arg!, v: `${m[1].toLowerCase()}|${m[2]}|${m[3]}` }, `${m[1].toUpperCase()} $${m[2]} for ${u.username}\nReason: ${m[3]}`); return true; }
  if (kind === "tkt.reply") { const t = await db.supportTicket.findUnique({ where: { id: arg } }); if (!t || text.length < 1) return true;
    await db.$transaction([db.supportMessage.create({ data: { ticketId: t.id, fromAdmin: true, body: text.slice(0, 4000) } }), db.supportTicket.update({ where: { id: t.id }, data: { status: "WAITING_USER" } }),
      db.notification.create({ data: { userId: t.userId, audience: "user", kind: "ticket.reply", body: `New reply on: ${t.subject}`.slice(0, 200) } })]);
    await audit({ adminTelegramId: a.telegramId, action: "tkt.reply", entityType: "Ticket", entityId: t.id, result: "ok", cid: c.cid }); await show(c2, "✅ Reply sent.", [back(`tkt:v:${t.id}`)]); return true; }
  if (kind === "set.min" || kind === "set.max") { const n = Number(text), other = Number(await setting(kind === "set.min" ? "maxDeposit" : "minDeposit", kind === "set.min" ? 500 : 1));
    if (!(n > 0 && n < 1_000_000) || (kind === "set.min" ? n > other : n < other)) { await show(c2, "❌ Invalid value (min must be ≤ max).", [back("set")]); return true; }
    await h.confirm(c2, a, { k: kind, id: "-", v: String(n) }, `${kind === "set.min" ? "Minimum" : "Maximum"} deposit → $${n}`); return true; }
  if (kind === "set.name" && text.length >= 2) { await h.confirm(c2, a, { k: "set.name", id: "-", v: text.slice(0, 60) }, `Website name → ${text.slice(0, 60)}`); return true; }
  return true;
}

export async function runMore(k: string, id: string, v?: string): Promise<string> {
  if (k === "ord.retry") { const r = await db.order.updateMany({ where: { id, status: "PENDING", providerRef: null }, data: { updatedAt: new Date() } });
    if (!r.count) throw new Error("NOT_RETRYABLE"); await db.outboxEvent.create({ data: { kind: "order.submit", payload: { orderId: id } } }); return "Queued for submission."; }
  if (k === "ord.link") { const r = await db.order.updateMany({ where: { id, status: "PROCESSING", providerRef: null }, data: { providerRef: v! } });
    if (!r.count) throw new Error("NOT_LINKABLE"); await db.orderEvent.create({ data: { orderId: id, kind: "manual_link", detail: { providerRef: v } } }); return "Linked. Status sync will take over."; }
  if (k === "ord.refund") { const o = await db.order.findUniqueOrThrow({ where: { id } }); if (o.status !== "PROCESSING" || o.providerRef) throw new Error("NOT_REFUNDABLE");
    await refundOrder(id, "admin: provider confirmed no order"); return "Refunded and marked FAILED."; }
  if (k === "usr.suspend") { await db.$transaction([db.user.update({ where: { id }, data: { status: "SUSPENDED" } }), db.session.deleteMany({ where: { userId: id } })]); return "User suspended and signed out."; }
  if (k === "usr.unsuspend") { await db.user.update({ where: { id }, data: { status: "ACTIVE" } }); return "User unsuspended."; }
  if (k === "usr.adjust") { const [t, amt, ...r] = v!.split("|"), reason = r.join("|");
    await db.$transaction((tx) => applyLedger(tx, { userId: id, type: "ADJUSTMENT", amount: (t === "debit" ? -1 : 1) * Number(amt), reference: `adj:${randomUUID()}`, description: reason }));
    return `Balance ${t === "debit" ? "debited" : "credited"} $${amt}.`; }
  if (k === "set.maint") { const cur = await setting("maintenance", false); await setSetting("maintenance", !cur); return `Maintenance ${!cur ? "ON" : "off"}.`; }
  if (k === "set.reg") { const cur = await setting("registrationEnabled", true); await setSetting("registrationEnabled", !cur); return `Registration ${!cur ? "open" : "closed"}.`; }
  if (k === "set.aba") { const cur = await setting<string[]>("paymentMethods", ["aba"]); const on = cur.includes("aba"); await setSetting("paymentMethods", on ? cur.filter((m) => m !== "aba") : [...cur, "aba"]); return `ABA ${on ? "disabled" : "enabled"}.`; }
  if (k === "set.min") { await setSetting("minDeposit", Number(v)); return "Minimum deposit updated."; }
  if (k === "set.max") { await setSetting("maxDeposit", Number(v)); return "Maximum deposit updated."; }
  if (k === "set.name") { await setSetting("siteName", v!); return "Website name updated."; }
  throw new Error("UNKNOWN_ACTION");
}
