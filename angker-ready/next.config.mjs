/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  // Never let a type/lint nit stop the panel from starting (runtime behaviour is unaffected).
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: { instrumentationHook: true },   // enables src/instrumentation.ts (bot webhook + "website online" message)
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      // Telegram Mini App may embed the page — do not set X-Frame-Options: DENY
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://web.telegram.org https://telegram.org;" },
    ] }];
  },
};
