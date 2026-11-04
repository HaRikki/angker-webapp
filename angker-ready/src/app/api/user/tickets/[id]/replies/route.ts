import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { hit } from "@/lib/rateLimit";
export const POST = (req: Request, { params }: { params: { id: string } }) => handle(async () => {
  const u = await requireUser();
  if (!(await hit(`tktr:${u.id}`, 20, 3600))) throw new Error("RATE_LIMITED");
  const { message } = parse(z.object({ message: z.string().trim().min(1).max(4000) }), await req.json().catch(() => null));
  const t = await db.supportTicket.findFirst({ where: { id: params.id, userId: u.id } });
  if (!t) throw new Error("NOT_FOUND");
  if (t.status === "CLOSED") throw new Error("FORBIDDEN");
  await db.$transaction([db.supportMessage.create({ data: { ticketId: t.id, body: message } }), db.supportTicket.update({ where: { id: t.id }, data: { status: "OPEN" } }),
    db.outboxEvent.create({ data: { kind: "admin.alert", payload: { text: `💬 Ticket ${t.id}: new user reply` } } })]);
  return NextResponse.json({ ok: true }, { status: 201 });
});
