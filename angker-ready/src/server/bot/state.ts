import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
export type Action = { k: string; id: string; v?: string };
export type State = { await?: { kind: string; arg?: string }; confirm?: { token: string; action: Action; summary: string } };
const TTL = 5 * 60_000;

export async function getState(tid: string): Promise<State> {
  const s = await db.botSession.findUnique({ where: { adminTelegramId: tid } });
  return s && s.expiresAt > new Date() ? (s.state as unknown as State) : {};   // expired sessions behave as empty
}
export const setState = (tid: string, state: State) => {
  const json = JSON.parse(JSON.stringify(state));   // plain JSON (drops undefined) for the Json column
  const expiresAt = new Date(Date.now() + TTL);
  return db.botSession.upsert({ where: { adminTelegramId: tid }, update: { state: json, expiresAt }, create: { adminTelegramId: tid, state: json, expiresAt } });
};
export const clearState = (tid: string) => db.botSession.deleteMany({ where: { adminTelegramId: tid } });
export const newToken = () => randomBytes(5).toString("hex");
