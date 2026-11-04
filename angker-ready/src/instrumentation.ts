// Runs once when the Next.js server starts (Node runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.NEXT_PHASE === "phase-production-build") return;
  const { bootTasks } = await import("@/server/boot");
  void bootTasks().then((r) => console.log("[boot]", JSON.stringify(r))).catch(() => {});
}
