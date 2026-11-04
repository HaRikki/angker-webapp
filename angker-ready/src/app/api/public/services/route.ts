import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handle, page } from "@/lib/api";
export const dynamic = "force-dynamic";

export const GET = (req: Request) => handle(async () => {
  const sp = new URL(req.url).searchParams, pg = page(sp);
  const q = sp.get("q")?.slice(0, 80);
  const cat = sp.get("categoryId");
  const featured = sp.get("featured") === "1";
  const sort = sp.get("sort") || "name";

  const where: Prisma.ServiceWhereInput = {
    active: true,
    archivedAt: null,
    category: { active: true },
    ...(cat ? { categoryId: cat } : {}),
    ...(sp.get("id") ? { id: sp.get("id")! } : {}),
    ...(sp.get("num") && Number.isInteger(Number(sp.get("num"))) ? { num: Number(sp.get("num")) } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };

  let orderBy: Prisma.ServiceOrderByWithRelationInput | Prisma.ServiceOrderByWithRelationInput[] =
    { name: "asc" };
  if (sort === "price_asc") orderBy = { sellPrice: "asc" };
  else if (sort === "price_desc") orderBy = { sellPrice: "desc" };
  else if (sort === "newest") orderBy = { num: "desc" };

  // Featured = lowest sell price in category or first N by num — simple heuristic
  const [total, services] = await Promise.all([
    db.service.count({ where }),
    db.service.findMany({
      where,
      orderBy,
      skip: featured ? 0 : pg.skip,
      take: featured ? 12 : pg.take,
      select: {
        id: true,
        num: true,
        categoryId: true,
        name: true,
        description: true,
        minQty: true,
        maxQty: true,
        sellPrice: true,
        refill: true,
        cancel: true,
        manual: true,
        startTime: true,
        avgTime: true,
        category: { select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    services: services.map((s) => ({
      ...s,
      sellPrice: Number(s.sellPrice),
      available: true,
    })),
    total,
    page: pg.page,
    pageSize: pg.pageSize,
  });
});
