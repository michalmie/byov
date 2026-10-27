import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Bundle fonts so builds work in Factory's offline checks.
const grotesk = localFont({
  variable: "--font-grotesk",
  src: "./fonts/space-grotesk.ttf",
  weight: "300 700",
  display: "swap",
});

const plex = localFont({
  variable: "--font-plex",
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
    default: `${siteName} Control Plane`,
    template: `%s | ${siteName}`,
  },
  description:
    "BYOV (Bring Your Own Vibe) control plane — govern vibe-coded apps: projects, nodes, environments and deployments.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${grotesk.variable} ${plex.variable} min-h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
