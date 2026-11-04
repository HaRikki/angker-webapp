import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const MAP: Record<string, [number, string]> = {
  UNAUTHENTICATED: [401, "Please sign in"], FORBIDDEN: [403, "Forbidden"], NOT_FOUND: [404, "Not found"],
  INSUFFICIENT_BALANCE: [402, "Insufficient balance"], DUPLICATE_REQUEST: [409, "Duplicate request"],
  SERVICE_UNAVAILABLE: [409, "Service unavailable"], INVALID_QUANTITY: [400, "Quantity out of range"],
  RATE_LIMITED: [429, "Too many requests"], MAINTENANCE: [503, "Maintenance"], PAYMENT_UNAVAILABLE: [503, "Payment unavailable"], INVALID_AMOUNT: [400, "Invalid amount"], INVALID_INPUT: [400, "Invalid input"], PRODUCT_NOT_FOUND: [404, "Product not found"], OUT_OF_STOCK: [409, "Out of stock"], WALLET_NOT_FOUND: [404, "Wallet not found"],
};
/** Centralized error handling: known codes map to safe messages; anything else is logged with a
 *  correlation id and returned as a generic 500 (no stack, no secrets). */
export async function handle(fn: () => Promise<Response>) {
  try { return await fn(); } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (MAP[code]) return NextResponse.json({ error: code, message: MAP[code][1] }, { status: MAP[code][0] });
    const cid = randomUUID();
    console.error("[api]", cid, e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ error: "INTERNAL", correlationId: cid }, { status: 500 });
  }
}
export const page = (sp: URLSearchParams) => {
  const p = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(20) })
    .parse({ page: sp.get("page") ?? undefined, pageSize: sp.get("pageSize") ?? undefined });
  return { ...p, skip: (p.page - 1) * p.pageSize, take: p.pageSize };
};
export const parse = <T extends z.ZodTypeAny>(s: T, v: unknown): z.infer<T> => {
  const r = s.safeParse(v); if (!r.success) throw new Error("INVALID_INPUT"); return r.data;
};
