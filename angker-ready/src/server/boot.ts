import { db } from "@/lib/db";
import { adminIds, notifyAdmins, tgCall } from "@/lib/telegram";

type TgJson = { ok?: boolean; description?: string; result?: any };
const tg = async (method: string, body: unknown = {}) =>
  ((await tgCall(method, body).then((r) => r.json()).catch(() => ({}))) as TgJson);

/** Registers the Telegram webhook when missing or pointing elsewhere. */
export async function ensureWebhook() {
  const url = `${(process.env.APP_URL ?? "").replace(/\/+$/, "")}/api/telegram/webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false, reason: "TELEGRAM_BOT_TOKEN missing" };
  if (!secret) return { ok: false, reason: "TELEGRAM_WEBHOOK_SECRET missing" };
  if (!url.startsWith("https://")) return { ok: false, reason: "APP_URL must be https://… (Telegram only supports https webhooks)" };
  const info = await tg("getWebhookInfo");
  if (info.ok && info.result?.url === url && !info.result?.last_error_message) return { ok: true, url, changed: false };
  const r = await tg("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
  return { ok: !!r.ok, url, changed: true, reason: r.ok ? undefined : r.description };
}

/**
 * Sets the bot Menu Button (bottom-left in chat) to open the Mini App.
 * Uses APP_URL as the Web App URL.
 */
export async function ensureMenuButton() {
  const app = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  if (!process.env.TELEGRAM_BOT_TOKEN) return { ok: false, reason: "TELEGRAM_BOT_TOKEN missing" };
  if (!app.startsWith("https://")) return { ok: false, reason: "APP_URL must be https://… for Mini App" };
  const r = await tg("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open App",
      web_app: { url: app },
    },
  });
  return { ok: !!r.ok, url: app, reason: r.ok ? undefined : r.description };
}

export async function dbStatus() {
  try {
    await db.user.count();
    await db.siteSetting.count();
    await db.outboxEvent.count();
    await db.rateLimit.count();
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, reason: e instanceof Error ? e.message.split("\n").pop()?.slice(0, 160) : "database error" };
  }
}

/** Runs once per server start: webhook + menu button + online notice. Never throws. */
export async function bootTasks(force = false) {
  const out: Record<string, unknown> = {};
  try {
    out.webhook = await ensureWebhook();
    out.menuButton = await ensureMenuButton();
    out.db = await dbStatus();
    out.admins = adminIds().length;
    let fresh = force;
    if (!force && (out.db as { ok: boolean }).ok) {
      fresh = await db.idempotencyKey
        .create({ data: { key: `boot:${new Date().toISOString().slice(0, 13)}`, scope: "boot" } })
        .then(() => true, () => false);
    }
    if (fresh) {
      const d = out.db as { ok: boolean; reason?: string };
      const w = out.webhook as { ok: boolean; reason?: string };
      const m = out.menuButton as { ok: boolean; reason?: string };
      const text = [
        "✅ Website is online — AngKer SMM Mini App",
        `🌐 ${process.env.APP_URL ?? ""}`,
        `🗄️ Database: ${d.ok ? "OK" : "ERROR — " + (d.reason ?? "")}`,
        `🤖 Bot webhook: ${w.ok ? "OK" : "NOT READY — " + (w.reason ?? "")}`,
        `📱 Menu Button: ${m.ok ? "OK (Open App)" : "NOT READY — " + (m.reason ?? "")}`,
        "Customers: /start → Open Mini App",
        "Admins: /start → Admin dashboard",
      ].join("\n");
      out.notified = await notifyAdmins(text).then(() => true, () => false);
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message.slice(0, 160) : "boot error";
  }
  return out;
}
