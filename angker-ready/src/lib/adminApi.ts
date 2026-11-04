import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}
export function fail(error: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status });
}
export function cid() {
  return randomBytes(8).toString("hex");
}
export function handleAdminError(e: unknown) {
  const msg = e instanceof Error ? e.message : "UNKNOWN";
  if (msg === "ADMIN_UNAUTHENTICATED") return fail("Unauthorized", 401);
  if (msg === "ADMIN_FORBIDDEN") return fail("Forbidden", 403);
  if (msg === "INSUFFICIENT_BALANCE") return fail("Insufficient balance", 400);
  if (msg === "WALLET_NOT_FOUND") return fail("Wallet not found", 404);
  console.error("[admin]", msg);
  return fail("Internal error", 500);
}
