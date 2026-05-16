import type { Metadata } from "next";
import "../styles/globals.css";
import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";
import SentryInit from "@/components/SentryInit";

export const metadata: Metadata = {
  title: {
    default: "Seirs Logistics — Nigeria's Smartest Last-Mile Delivery Platform",
    template: "%s | Seirs Logistics",
  },
  description:
    "Seirs connects Nigerian businesses, customers, drivers, and partner stores for fast, reliable last-mile delivery. Real-time tracking, business wallets, and a network of verified drivers across Nigeria.",
  keywords: [
    "logistics Nigeria",
    "last mile delivery Nigeria",
    "delivery Lagos",
    "package delivery Nigeria",
    "business delivery",
    "courier Nigeria",
  ],
  openGraph: {
    type: "website",
    locale: "en_NG",
    url: "https://seirs.co",
    siteName: "Seirs Logistics",
    title: "Seirs Logistics — Nigeria's Smartest Last-Mile Delivery Platform",
    description:
      "Send thousands of packages with one click. Real-time tracking, business wallets, and a network of verified drivers across Nigeria.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Seirs Logistics",
    description: "Nigeria's Smartest Last-Mile Delivery Platform",
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
