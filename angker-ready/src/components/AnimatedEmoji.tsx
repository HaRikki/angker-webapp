"use client";

/**
 * Premium-style animated emoji for Telegram Mini App UI.
 * Uses large emoji glyphs + CSS motion (float, pulse, bounce, sparkle).
 */
type Motion = "idle" | "bounce" | "pulse" | "float" | "spin" | "wiggle" | "pop";

const MOTION: Record<Motion, string> = {
  idle: "",
  bounce: "ae-bounce",
  pulse: "ae-pulse",
  float: "ae-float",
  spin: "ae-spin",
  wiggle: "ae-wiggle",
  pop: "ae-pop",
};

export function AnimatedEmoji({
  emoji,
  motion = "idle",
  size = 22,
  className = "",
  title,
}: {
  emoji: string;
  motion?: Motion;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      role="img"
      aria-label={title || emoji}
      title={title}
      className={`ae-emoji inline-flex select-none items-center justify-center leading-none ${MOTION[motion]} ${className}`}
      style={{ fontSize: size, width: size + 4, height: size + 4 }}
    >
      {emoji}
    </span>
  );
}

/** Bottom-nav emoji set (Premium look) */
export const NAV_EMOJI = {
  dashboard: "🏠",
  newOrder: "🛒",
  orders: "📦",
  funds: "💎",
  profile: "👤",
  services: "✨",
  tx: "💳",
  tickets: "🎫",
  api: "🔑",
} as const;

export const UI_EMOJI = {
  money: "💰",
  rocket: "🚀",
  check: "✅",
  fire: "🔥",
  star: "⭐",
  chart: "📊",
  bell: "🔔",
  wave: "👋",
  spark: "✨",
  wallet: "👛",
  up: "📈",
  down: "📉",
  party: "🎉",
  lock: "🔐",
  globe: "🌐",
} as const;
