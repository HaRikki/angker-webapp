import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  const categories = await db.category.findMany({ where: { active: true, archivedAt: null }, orderBy: [{ sort: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  return NextResponse.json({ categories });
}
