import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
export const dynamic = "force-dynamic";

export const GET = (_: Request, { params }: { params: { id: string } }) => handle(async () => {
  const u = await requireUser();
  const order = await db.order.findFirst({
    where: { id: params.id, userId: u.id },
    select: {
      id: true,
      serviceName: true,
      serviceId: true,
      target: true,
      quantity: true,
      sellPrice: true,
      currency: true,
      status: true,
      providerRef: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: { createdAt: "asc" },
        select: { kind: true, detail: true, createdAt: true },
      },
    },
  });
  if (!order) throw new Error("NOT_FOUND");

  // Public-safe provider status label
  const statusLabel: Record<string, string> = {
    PENDING: "Pending",
    PROCESSING: "Processing",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    PARTIAL: "Partial",
    CANCELLED: "Cancelled",
    FAILED: "Failed",
  };

  // Refund history from wallet (same reference)
  const refunds = await db.walletTransaction.findMany({
    where: { userId: u.id, type: "REFUND", reference: order.id },
    select: { id: true, amount: true, description: true, createdAt: true },
  });

  return NextResponse.json({
    order: {
      ...order,
      sellPrice: Number(order.sellPrice),
      statusLabel: statusLabel[order.status] ?? order.status,
      // Do not expose providerCost or internal provider errors
      timeline: order.events.map((e) => ({
        kind: e.kind,
        at: e.createdAt,
        // Strip sensitive detail keys if any
        detail: e.detail && typeof e.detail === "object"
          ? Object.fromEntries(
              Object.entries(e.detail as Record<string, unknown>).filter(
                ([k]) => !["apiKey", "raw", "error", "providerCost"].includes(k)
              )
            )
          : e.detail,
      })),
      refunds: refunds.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        description: r.description,
        createdAt: r.createdAt,
      })),
    },
  });
});
