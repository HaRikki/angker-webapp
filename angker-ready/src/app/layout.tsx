import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Khmer, Poppins } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { getLang, getTheme } from "@/i18n/server";
import { publicSettings } from "@/lib/settings";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-poppins", display: "swap" });
const khmer = Noto_Sans_Khmer({ subsets: ["khmer"], variable: "--font-khmer", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const s = await publicSettings();
  return {
    title: s.siteName,
    description: s.description || "Social media marketing services",
    appleWebApp: { capable: true, statusBarStyle: "default", title: s.siteName },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#181818" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = getLang(), theme = getTheme();
  return (
    <html lang={lang} className={`${theme === "dark" ? "dark" : ""} ${inter.variable} ${khmer.variable} ${poppins.variable}`} suppressHydrationWarning>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="overflow-x-hidden">
        <Providers lang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
