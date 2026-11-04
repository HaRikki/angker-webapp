/** Logo is the Telegram bot's own profile photo, served by /api/bot-logo. */
export const DEFAULT_LOGO = "/api/bot-logo";
export function Logo({ name, logoUrl, size = 36 }: { name: string; logoUrl?: string; size?: number }) {
  return (
    <span className="flex items-center gap-2 font-bold tracking-tight">
      <img src={DEFAULT_LOGO} alt={name} width={size} height={size} style={{ width: size, height: size }} className="shrink-0 object-contain" />
      {name}
    </span>
  );
}
