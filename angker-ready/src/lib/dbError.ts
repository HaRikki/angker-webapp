import { Prisma } from "@prisma/client";
import { notifyAdmins } from "@/lib/telegram";

export type ApiErrorCode = "DB_UNAVAILABLE" | "DB_NOT_READY" | "SERVER_ERROR";

/** Maps a thrown error to a code the UI can explain (database not reachable / tables missing / other). */
export function classify(e: unknown): { code: ApiErrorCode; status: number } {
  if (e instanceof Prisma.PrismaClientInitializationError) return { code: "DB_UNAVAILABLE", status: 503 };
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2021" || e.code === "P2022") return { code: "DB_NOT_READY", status: 503 };       // table / column missing
    if (["P1000", "P1001", "P1002", "P1003", "P1008", "P1017", "P2024"].includes(e.code)) return { code: "DB_UNAVAILABLE", status: 503 };
  }
  const m = e instanceof Error ? e.message : "";
  if (/DATABASE_URL|Can't reach database|does not exist in the current database|relation ".*" does not exist/i.test(m)) return { code: "DB_UNAVAILABLE", status: 503 };
  return { code: "SERVER_ERROR", status: 500 };
}

let lastAlert = 0;
/** Logs the real reason and (at most every 10 min) tells the Telegram admin, so the owner sees WHY it failed. */
export function reportServerError(scope: string, e: unknown, code: ApiErrorCode) {
  const msg = (e instanceof Error ? `${e.name}${(e as { code?: string }).code ? ` ${(e as { code?: string }).code}` : ""}: ${e.message}` : String(e))
    .replace(/postgres(ql)?:\/\/\S+/gi, "postgres://***").split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 300);
  console.error(`[${scope}] ${code}`, msg);
  if (Date.now() - lastAlert < 600_000) return;
  lastAlert = Date.now();
  void notifyAdmins(`⚠️ ${scope} failed (${code})\n${msg}\n\nFix: set DATABASE_URL, then run: npx prisma db push`).catch(() => {});
}
