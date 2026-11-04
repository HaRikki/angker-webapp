const api = (m: string, b: unknown) => fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${m}`,
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b), signal: AbortSignal.timeout(10000) });
export const adminIds = () => (process.env.TELEGRAM_ADMIN_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export async function sendMessage(chatId: string, text: string) {
  const r = await api("sendMessage", { chat_id: chatId, text });
  if (!r.ok) throw new Error(`TG_${r.status}`);
}
/** Sends to every admin; one failing admin never blocks the others. Throws only if nobody could be reached. */
export async function notifyAdmins(text: string) {
  const ids = adminIds();
  if (!ids.length || !process.env.TELEGRAM_BOT_TOKEN) return;
  const res = await Promise.allSettled(ids.map((id) => sendMessage(id, text)));
  if (res.every((r) => r.status === "rejected")) throw new Error("TG_NOTIFY_FAILED");
}
export const tgCall = api;
