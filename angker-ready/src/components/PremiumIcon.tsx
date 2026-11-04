"use client";
import type { LucideIcon } from "lucide-react";
import {
  Store,
  ShoppingBag,
  Package,
  Wallet,
  User,
  Shield,
  Sparkles,
  Plus,
  CreditCard,
  MessageCircle,
  KeyRound,
  Search,
  Box,
  Zap,
  Star,
  Rocket,
  Gem,
  Music,
  Palette,
  Clapperboard,
  Bot,
} from "lucide-react";

const MAP = {
  smm: Store,
  digital: ShoppingBag,
  orders: Package,
  wallet: Wallet,
  profile: User,
  admin: Shield,
  spark: Sparkles,
  plus: Plus,
  card: CreditCard,
  chat: MessageCircle,
  key: KeyRound,
  search: Search,
  box: Box,
  zap: Zap,
  star: Star,
  rocket: Rocket,
  gem: Gem,
  music: Music,
  palette: Palette,
  film: Clapperboard,
  bot: Bot,
} as const;

export type IconName = keyof typeof MAP;

export function PremiumIcon({
  name,
  size = 22,
  active = false,
  className = "",
}: {
  name: IconName;
  size?: number;
  active?: boolean;
  className?: string;
}) {
  const Icon: LucideIcon = MAP[name] || Sparkles;
  return (
    <span
      className={`inline-flex items-center justify-center transition ${
        active ? "text-cyan scale-110" : "text-muted"
      } ${className}`}
      style={{ width: size + 4, height: size + 4 }}
    >
      <Icon
        size={size}
        strokeWidth={active ? 2.4 : 2}
        className={active ? "drop-shadow-[0_0_8px_rgba(37,99,235,0.45)]" : ""}
      />
    </span>
  );
}

/** Rounded gradient tile icon (product cards / quick actions) */
export function IconTile({
  name,
  size = 28,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Icon: LucideIcon = MAP[name] || Sparkles;
  return (
    <span
      className={`grid place-items-center rounded-2xl bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-violet-500/15 text-cyan shadow-sm ring-1 ring-cyan/10 ${className}`}
      style={{ width: size + 20, height: size + 20 }}
    >
      <Icon size={size} strokeWidth={2} />
    </span>
  );
}
