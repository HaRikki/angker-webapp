import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export async function GET() {
  const u = await getSessionUser();
  return NextResponse.json({ user: u ? { id: u.id, username: u.username, email: u.email } : null });
}
