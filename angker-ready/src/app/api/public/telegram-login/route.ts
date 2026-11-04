import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
let cached = "";
/** Bot username for the Telegram Login Widget. Uses TELEGRAM_BOT_USERNAME, or asks Telegram (getMe) with the bot token. */
async function botUsername() {
  const fromEnv = (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "").trim();
  if (fromEnv) return fromEnv;
  if (cached) return cached;
  if (!process.env.TELEGRAM_BOT_TOKEN) return "";
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  const d = await r?.json().catch(() => null);
  return (cached = d?.result?.username ?? "");
}
export async function GET() {
  const id = (process.env.TELEGRAM_BOT_TOKEN ?? "").split(":")[0].replace(/\D/g, ""); // numeric bot id is public (first part of the token)
  return NextResponse.json({ bot: await botUsername(), id });
}
