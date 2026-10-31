import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FantasyProvider } from "@/lib/store";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const viewport: Viewport = {
  themeColor: "#04100c",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Adare 2027 — Fantasy Ryder Cup",
  description:
    "Draft six players, name a captain and take on your mates across the 46th Ryder Cup at Adare Manor, 17–19 September 2027.",
  openGraph: {
    title: "Adare 2027 — Fantasy Ryder Cup",
    description:
      "The fantasy league for the 100th anniversary Ryder Cup at Adare Manor. Pick six, ride the singles.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-forest-950 font-sans text-cream antialiased">
        <FantasyProvider>
          <SiteHeader />
          <main>{children}</main>
          <SiteFooter />
        </FantasyProvider>
      </body>
    </html>
  );
}
