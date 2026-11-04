import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, page, parse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { hit } from "@/lib/rateLimit";
export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  const u = await requireUser(), pg = page(new URL(req.url).searchParams), where = { userId: u.id };
  const [total, tickets] = await Promise.all([db.supportTicket.count({ where }), db.supportTicket.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take, select: { id: true, category: true, subject: true, status: true, createdAt: true } })]);
  return NextResponse.json({ tickets, total, page: pg.page, pageSize: pg.pageSize });
});
const body = z.object({ category: z.enum(["order", "payment", "account", "other"]), subject: z.string().trim().min(3).max(120), message: z.string().trim().min(3).max(4000) });
export const POST = (req: Request) => handle(async () => {
  const u = await requireUser();
  if (!(await hit(`tkt:${u.id}`, 10, 3600))) throw new Error("RATE_LIMITED");
  const b = parse(body, await req.json().catch(() => null)); // stored raw; rendered as text (React escapes). No file uploads yet.
  const t = await db.supportTicket.create({ data: { userId: u.id, category: b.category, subject: b.subject, messages: { create: { body: b.message } } } });
  await db.outboxEvent.create({ data: { kind: "admin.alert", payload: { text: `🎫 New ticket ${t.id} from ${u.username}` } } });
  return NextResponse.json({ ticket: { id: t.id, status: t.status } }, { status: 201 });
});
