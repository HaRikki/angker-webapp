import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const announcements = await db.announcement.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, title: true, body: true, createdAt: true } });
  return NextResponse.json({ announcements });
}
