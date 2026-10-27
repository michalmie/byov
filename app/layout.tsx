import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Bundle fonts so builds work in Factory's offline checks.
const display = localFont({
  variable: "--font-display",
  src: "./fonts/space-grotesk.ttf",
  weight: "300 700",
  display: "swap",
});

const mono = localFont({
  variable: "--font-mono",
  src: [
    { path: "./fonts/ibm-plex-mono-regular.ttf", weight: "400" },
    { path: "./fonts/ibm-plex-mono-medium.ttf", weight: "500" },
    { path: "./fonts/ibm-plex-mono-semibold.ttf", weight: "600" },
  ],
  display: "swap",
});

const siteName = "BYOV";

export const metadata: Metadata = {
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: `${siteName} is a Vibe Factory generated website project.`,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable} min-h-full bg-[var(--page)]`}
    >
      <body className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(22,163,74,0.16),_transparent_34%),linear-gradient(180deg,_rgba(255,251,235,0.96),_rgba(244,244,245,0.96))] text-[var(--ink)]">
        {children}
      </body>
    </html>
  );
}
