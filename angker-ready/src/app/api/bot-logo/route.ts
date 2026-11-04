export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Serves the Telegram bot's own profile photo, so the WebApp logo always matches the bot. */
let cache: { buf: ArrayBuffer; type: string; at: number } | null = null;
const TTL = 10 * 60 * 1000;

async function tg(method: string, qs: Record<string, string>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}?${new URLSearchParams(qs)}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const d = await r?.json().catch(() => null);
  return d?.ok ? d.result : null;
}

async function load() {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const botId = token.split(":")[0].replace(/\D/g, "");
  if (!botId) return null;
  let fileId: string | undefined;
  const photos = await tg("getUserProfilePhotos", { user_id: botId, limit: "1" });
  const sizes = photos?.photos?.[0];
  if (sizes?.length) fileId = sizes[sizes.length - 1].file_id;
  if (!fileId) {
    const me = await tg("getMe", {});
    const chat = me?.username ? await tg("getChat", { chat_id: `@${me.username}` }) : null;
    fileId = chat?.photo?.big_file_id ?? chat?.photo?.small_file_id;
  }
  if (!fileId) return null;
  const file = await tg("getFile", { file_id: fileId });
  if (!file?.file_path) return null;
  const img = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!img?.ok) return null;
  return { buf: await img.arrayBuffer(), type: img.headers.get("content-type") || "image/jpeg", at: Date.now() };
}

const FALLBACK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#2563eb"/><text x="32" y="42" font-family="Arial,sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="#fff">AK</text></svg>`;

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL) {
    const fresh = await load().catch(() => null);
    if (fresh) cache = fresh;
  }
  if (cache) return new Response(cache.buf, { headers: { "content-type": cache.type, "cache-control": "public, max-age=600" } });
  return new Response(FALLBACK, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=60" } });
}
