import { db } from "@/lib/db";
import { Ctx, show, esc, back, Btn } from "./ui";

export async function listCategories(c: Ctx) {
  const cats = await db.category.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, include: { _count: { select: { services: true } } } });
  const rows: Btn[][] = cats.map((x) => [{ text: `${x.active ? "🟢" : "⚪"} ${x.name} (${x._count.services})`, callback_data: `svc:l:${x.id}:0` }]);
  rows.push([{ text: "➕ Add Category", callback_data: "svc:ca" }], back());
  await show(c, "<b>🛍️ Services — Categories</b>", rows);
}
export async function listServices(c: Ctx, catId: string, pg: number) {
  const PS = 8, cat = await db.category.findUnique({ where: { id: catId } });
  if (!cat) return show(c, "Category not found.", [back("svc")]);
  const where = { categoryId: catId, archivedAt: null };
  const [total, items] = await Promise.all([db.service.count({ where }), db.service.findMany({ where, orderBy: { name: "asc" }, skip: pg * PS, take: PS })]);
  const rows: Btn[][] = items.map((s) => [{ text: `${s.active ? "🟢" : "⚪"} ${s.name.slice(0, 40)}`, callback_data: `svc:v:${s.id}` }]);
  const nav: Btn[] = [];
  if (pg > 0) nav.push({ text: "◀️", callback_data: `svc:l:${catId}:${pg - 1}` });
  if ((pg + 1) * PS < total) nav.push({ text: "▶️", callback_data: `svc:l:${catId}:${pg + 1}` });
  if (nav.length) rows.push(nav);
  rows.push([{ text: cat.active ? "⏸ Disable category" : "▶️ Enable category", callback_data: `svc:ct:${catId}` }], back("svc"));
  await show(c, `<b>${esc(cat.name)}</b> — ${total} service(s), page ${pg + 1}`, rows);
}
export async function viewService(c: Ctx, id: string) {
  const s = await db.service.findUnique({ where: { id }, include: { mapping: { include: { provider: true } }, category: true } });
  if (!s || s.archivedAt) return show(c, "Service not found.", [back("svc")]);
  const text = `<b>${esc(s.name)}</b>\nCategory: ${esc(s.category.name)}\nSell: $${s.sellPrice}/1k  |  Cost: $${s.costPrice}/1k\nMin: ${s.minQty}  Max: ${s.maxQty}\nStatus: ${s.active ? "active" : "disabled"}\nProvider: ${esc(s.mapping?.provider.name ?? "—")} #${esc(s.mapping?.providerServiceId ?? "—")}\nLast sync: ${s.mapping?.lastSyncAt?.toISOString() ?? "—"}`;
  await show(c, text, [
    [{ text: s.active ? "⏸ Disable" : "▶️ Enable", callback_data: `svc:tg:${id}` }],
    [{ text: "💲 Price", callback_data: `svc:ep:${id}` }, { text: "✏️ Name", callback_data: `svc:en:${id}` }, { text: "↔️ Min/Max", callback_data: `svc:em:${id}` }],
    [{ text: "🗄 Archive", callback_data: `svc:ar:${id}` }], back(`svc:l:${s.categoryId}:0`)]);
}
export async function runServiceAction(k: string, id: string, v?: string) {
  if (k === "svc.toggle") { const s = await db.service.findUniqueOrThrow({ where: { id } }); await db.service.update({ where: { id }, data: { active: !s.active } }); return `Service ${s.active ? "disabled" : "enabled"}.`; }
  if (k === "svc.archive") { await db.service.update({ where: { id }, data: { active: false, archivedAt: new Date() } }); return "Service archived (history kept)."; } // soft delete
  if (k === "svc.price") { await db.service.update({ where: { id }, data: { sellPrice: v! } }); return "Price updated (applies to new orders only)."; }
  if (k === "svc.name") { await db.service.update({ where: { id }, data: { name: v!.slice(0, 120) } }); return "Name updated."; }
  if (k === "svc.minmax") { const [mn, mx] = v!.split(" ").map(Number); await db.service.update({ where: { id }, data: { minQty: mn, maxQty: mx } }); return "Limits updated."; }
  if (k === "cat.toggle") { const x = await db.category.findUniqueOrThrow({ where: { id } }); await db.category.update({ where: { id }, data: { active: !x.active } }); return "Category toggled."; }
  throw new Error("UNKNOWN_ACTION");
}
export const addCategory = (name: string) => db.category.create({ data: { name: name.trim().slice(0, 40) } });
