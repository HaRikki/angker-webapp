import { db } from "@/lib/db";
import { Ctx, show, back, Btn } from "./ui";

export async function overview(c: Ctx) {
  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const [users, today, byStatus, dep, sales, refunds, tickets] = await Promise.all([
    db.user.count(), db.user.count({ where: { createdAt: { gte: day } } }),
    db.order.groupBy({ by: ["status"], _count: true }),
    db.deposit.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
    db.order.aggregate({ where: { status: "COMPLETED" }, _sum: { sellPrice: true, providerCost: true } }),
    db.walletTransaction.aggregate({ where: { type: "REFUND" }, _sum: { amount: true } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "WAITING_USER"] } } }),
  ]);
  const n = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;
  const total = byStatus.reduce((a, x) => a + x._count, 0);
  const sell = Number(sales._sum.sellPrice ?? 0), cost = Number(sales._sum.providerCost ?? 0);
  const text = `<b>📊 Overview</b>\n\n👥 Users: ${users} (+${today} today)\n📦 Orders: ${total}\n• Pending: ${n("PENDING")}  Processing: ${n("PROCESSING") + n("IN_PROGRESS")}\n• Completed: ${n("COMPLETED")}  Failed: ${n("FAILED")}\n\n💰 Deposits (paid): $${Number(dep._sum.amount ?? 0).toFixed(2)}\n🧾 Sales (completed orders): $${sell.toFixed(2)}\n🏭 Provider cost: $${cost.toFixed(2)}\n↩️ Refunds: $${Number(refunds._sum.amount ?? 0).toFixed(2)}\n📈 Est. gross profit: $${(sell - cost).toFixed(2)} <i>(not net profit)</i>\n🎫 Open tickets: ${tickets}\n\n<i>Deposits are wallet top-ups, not revenue.</i>`;
  const rows: Btn[][] = [[{ text: "🔄 Refresh", callback_data: "ov" }], back()];
  await show(c, text, rows);
}
