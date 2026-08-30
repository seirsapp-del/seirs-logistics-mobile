import type { Metadata } from "next";
import "../styles/globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";
import SentryInit from "@/components/SentryInit";
import { SITE_URL } from "@/lib/launch";

/**
 * Canonical host comes from launch.ts, never from a literal here.
 *
 * Until 2026-08-23 this file hardcoded https://seirs-website.vercel.app for
 * OpenGraph while sitemap.ts and launch.ts defaulted to https://seirs.co,
 * so setting NEXT_PUBLIC_SITE_URL on Vercel moved two of the three and left
 * every share card pointing at the other domain. The wider split across the
 * backend (WEBSITE_URL, PUBLIC_SITE_URL, PUBLIC_WEB_URL) is W-4 and is not
 * fixable from this app.
 *
 * metadataBase is what lets every page give a relative OG image path and get
 * an absolute URL in the tag. Without it Next emits the bare path, which no
 * scraper can resolve, which is why shares rendered as text with no card.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SEIRS Logistics, Nigeria's Smartest Last-Mile Delivery Platform",
    template: "%s | SEIRS Logistics",
  },
  description:
    "SEIRS connects Nigerian businesses, customers, drivers, and partner stores for fast, reliable last-mile delivery. Real-time tracking, multi-stop runs, and a network of verified drivers across Nigeria.",
  keywords: [
    "logistics Nigeria",
    "last mile delivery Nigeria",
    "delivery Lagos",
    "package delivery Nigeria",
    "business delivery",
    "courier Nigeria",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: SITE_URL,
    siteName: "SEIRS Logistics",
    title: "SEIRS Logistics, Nigeria's Smartest Last-Mile Delivery Platform",
    description:
      "Send many packages in one booking. Real-time tracking, multi-stop runs, and a network of verified drivers across Nigeria.",
    // Resolved against metadataBase above. Brand card: the okada mark on the
    // navy gradient the hero uses, no invented statistics on it.
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "SEIRS Logistics, Nigeria's smartest last-mile delivery platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SEIRS Logistics",
    description: "Nigeria's Smartest Last-Mile Delivery Platform",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SentryInit />
        <Nav />
        <main className="pt-16">{children}</main>
        <Footer />
        <CookieBanner />
      </body>
    </html>
  );
}
