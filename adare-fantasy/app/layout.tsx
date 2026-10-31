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
  title: "Twenty-Eight — Fantasy Ryder Cup",
  description:
    "Draft a card, call all 28 matches and follow the Ryder Cup live. Adare 2027, 17–19 September 2027.",
  openGraph: {
    title: "Twenty-Eight — Fantasy Ryder Cup",
    description:
      "Cup fantasy, properly scored. Draft a card, call all 28 matches, follow every point live.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-forest-950 font-sans text-cream antialiased">
        <FantasyProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-forest-950"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main" tabIndex={-1} className="focus:outline-none">
            {children}
          </main>
          <SiteFooter />
        </FantasyProvider>
      </body>
    </html>
  );
}
