import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { MotionPreferences } from "@/components/motion-preferences";
import { RouteProgress } from "@/components/shell/route-progress";

import "./globals.css";

// Plus Jakarta Sans — the same UI font Greenlight ships. Used for everything
// editorial: hero, body, nav, form fields. Variable across 200–800.
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

// JetBrains Mono for code surfaces and tabular data overlays.
const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TESSAR — Researched architecture, on demand",
  description:
    "Describe your system in plain words. Get a defensible architecture, backed by research, in one run.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#18191A" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${monoFont.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Material Symbols (variable font, rounded). Single icon source for the whole UI. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="bg-surface text-on-surface font-sans antialiased">
        <ThemeProvider>
          <MotionPreferences>
            <RouteProgress />
            {children}
          </MotionPreferences>
        </ThemeProvider>
      </body>
    </html>
  );
}
