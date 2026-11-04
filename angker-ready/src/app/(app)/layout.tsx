import { AppShell } from "@/components/AppShell";
import { Maintenance } from "@/components/Maintenance";
import { TelegramWebAppAuth } from "@/components/TelegramWebApp";
import { getSessionUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { publicSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser().catch(() => null);
  const s = await publicSettings();
  if (s.maintenance) return <Maintenance />;

  if (!user) {
    return <TelegramWebAppAuth />;
  }

  const w = await db.wallet.findUnique({ where: { userId: user.id } });
  return (
    <TelegramWebAppAuth>
      <AppShell
        siteName={s.siteName}
        logoUrl={s.logoUrl}
        username={user.username}
        balance={String(w?.balance ?? 0)}
        telegramId={user.telegramId ? String(user.telegramId) : ""}
      >
        {children}
      </AppShell>
    </TelegramWebAppAuth>
  );
}
