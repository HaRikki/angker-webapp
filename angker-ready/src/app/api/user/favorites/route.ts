import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, parse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";

export const GET = () => handle(async () => {
  const u = await requireUser();
  const favs = await db.favorite.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: "desc" },
    include: {
      service: {
        select: {
          id: true, num: true, name: true, description: true,
          minQty: true, maxQty: true, sellPrice: true, active: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });
  return NextResponse.json({
    favorites: favs
      .filter((f) => f.service.active)
      .map((f) => ({
        id: f.id,
        serviceId: f.serviceId,
        createdAt: f.createdAt,
        service: {
          ...f.service,
          sellPrice: Number(f.service.sellPrice),
        },
      })),
  });
});

export const POST = (req: Request) => handle(async () => {
  const u = await requireUser();
  const { serviceId } = parse(z.object({ serviceId: z.string().min(1) }), await req.json().catch(() => null));
  const svc = await db.service.findFirst({ where: { id: serviceId, active: true, archivedAt: null } });
  if (!svc) throw new Error("SERVICE_UNAVAILABLE");
  const fav = await db.favorite.upsert({
    where: { userId_serviceId: { userId: u.id, serviceId } },
    update: {},
    create: { userId: u.id, serviceId },
  });
  return NextResponse.json({ ok: true, id: fav.id }, { status: 201 });
});

export const DELETE = (req: Request) => handle(async () => {
  const u = await requireUser();
  const { serviceId } = parse(z.object({ serviceId: z.string().min(1) }), await req.json().catch(() => null));
  await db.favorite.deleteMany({ where: { userId: u.id, serviceId } });
  return NextResponse.json({ ok: true });
});
