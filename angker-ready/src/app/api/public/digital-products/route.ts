import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DIGITAL_PRODUCTS } from "@/lib/digital-products";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.digitalProduct.findMany({
      where: { active: true },
      orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
      include: { category: { select: { name: true } } },
    });
    if (rows.length) {
      return NextResponse.json({
        products: rows.map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.price),
          emoji: p.emoji,
          imageUrl: (p as any).imageUrl || "",
          stock: p.stock,
          delivery: p.delivery,
          description: p.description
            ? p.description.split("\n").map((s) => s.trim()).filter(Boolean)
            : [],
          features: (p as any).features
            ? String((p as any).features)
                .split("\n")
                .map((s: string) => s.trim())
                .filter(Boolean)
            : [],
          category: p.category?.name || null,
        })),
      });
    }
  } catch {
    /* before migrate */
  }
  return NextResponse.json({ products: DIGITAL_PRODUCTS });
}
