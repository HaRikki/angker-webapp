import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
export const GET = (_: Request, { params }: { params: { id: string } }) => handle(async () => {
  const u = await requireUser();
  const ticket = await db.supportTicket.findFirst({ where: { id: params.id, userId: u.id }, select: { id: true, category: true, subject: true, status: true, createdAt: true, messages: { orderBy: { createdAt: "asc" }, select: { id: true, fromAdmin: true, body: true, createdAt: true } } } });
  if (!ticket) throw new Error("NOT_FOUND");
  return NextResponse.json({ ticket });
});
