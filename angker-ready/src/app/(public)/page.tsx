import { TelegramWebAppAuth } from "@/components/TelegramWebApp";

export const dynamic = "force-dynamic";

/** Root entry for the Telegram Mini App — auto-auth via initData, no login form. */
export default function Home() {
  return <TelegramWebAppAuth />;
}
