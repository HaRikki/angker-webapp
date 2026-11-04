import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/server/providers/registry", () => ({ getProvider: vi.fn() }));
import { db } from "@/lib/db";
import { getProvider } from "@/server/providers/registry";
import { previewSync, syncServices } from "@/server/providers/syncServices";
import { resetDb } from "./helpers";

const remote = (rate: string) => [{ service: "10", name: "A", category: "TikTok", rate, min: "100", max: "5000" }, { service: "11", name: "B", category: "Telegram", rate, min: "10", max: "900" }];
beforeEach(resetDb);
it("repeated sync never duplicates; new services start disabled; admin price/name survive", async () => {
  const p = await db.provider.create({ data: { name: "P", baseUrl: "https://p.test", apiKeyEnc: "x" } });
  const services = vi.fn().mockResolvedValue(remote("1.00"));
  vi.mocked(getProvider).mockResolvedValue({ row: p, client: { services } } as never);
  expect(await previewSync(p.id)).toMatchObject({ found: 2, new: 2, existing: 0 });
  expect(await syncServices(p.id)).toEqual({ created: 2, updated: 0 });
  expect(await db.service.count({ where: { active: true } })).toBe(0);
  const a = await db.service.findFirstOrThrow({ where: { name: "A" } });
  expect(Number(a.sellPrice)).toBeCloseTo(1.2);
  await db.service.update({ where: { id: a.id }, data: { sellPrice: "9", name: "Renamed", active: true } });
  services.mockResolvedValue(remote("2.00"));
  expect(await syncServices(p.id)).toEqual({ created: 0, updated: 2 });
  const after = await db.service.findUniqueOrThrow({ where: { id: a.id } });
  expect(await db.service.count()).toBe(2); expect(await db.providerServiceMapping.count()).toBe(2);
  expect(Number(after.sellPrice)).toBe(9); expect(after.name).toBe("Renamed"); expect(after.active).toBe(true); expect(Number(after.costPrice)).toBe(2);
});
