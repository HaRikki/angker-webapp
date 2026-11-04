import { tgCall } from "@/lib/telegram";

/** Inline button: either callback or Telegram Mini App (web_app). */
export type Btn =
  | { text: string; callback_data: string }
  | { text: string; web_app: { url: string } }
  | { text: string; url: string };

export type Ctx = { tid: string; chatId: string; msgId?: number; cid: string };
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
export const back = (to = "home"): Btn[] => [{ text: "⬅️ Back", callback_data: to }];

/** Mini App URL from APP_URL (must be https). */
export function miniAppUrl(): string | null {
  const u = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return u.startsWith("https://") ? u : null;
}

export async function show(c: Ctx, text: string, rows: Btn[][]) {
  const body = { chat_id: c.chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: rows } };
  if (c.msgId) {
    const r = await tgCall("editMessageText", { ...body, message_id: c.msgId });
    if (r.ok) return;
  }
  await tgCall("sendMessage", body);
}

/** Welcome message for customers with Open Mini App button. */
export async function sendCustomerStart(chatId: string) {
  const app = miniAppUrl();
  const text = app
    ? "✨ <b>សូមស្វាគមន៍!</b>\n\n🚀 ចុចប៊ូតុងខាងក្រោមដើម្បីបើក <b>Mini App</b>។\n\nWelcome! Tap below to open the Mini App."
    : "<b>សូមស្វាគមន៍!</b>\n\nMini App មិនទាន់កំណត់ URL (APP_URL) ទេ។ សូមទាក់ទង Admin។\n\nWelcome! Mini App URL is not configured yet.";
  const rows: Btn[][] = app
    ? [[{ text: "✨ បើក Mini App / Open App", web_app: { url: app } }]]
    : [];
  await tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: rows.length ? { inline_keyboard: rows } : undefined,
  });
}

export const answer = (id: string, text?: string) => tgCall("answerCallbackQuery", { callback_query_id: id, text });
export const del = (chatId: string, msgId: number) => tgCall("deleteMessage", { chat_id: chatId, message_id: msgId });
