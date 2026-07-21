import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import TopProgress from "@/components/TopProgress";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Ganti dengan domain produksi via env NEXT_PUBLIC_SITE_URL
// (mis. https://industry.seawise.app). Di Vercel otomatis pakai URL deploy.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Seawise Enterprise Apps — Industry Edition",
    template: "%s · Seawise Industry",
  },
  description:
    "ERP manufaktur kosmetik siap audit CPKB: purchase order, stok FEFO, produksi & HPP real per batch, MES, QC/QA, penjualan, dan regulasi INCI.",
  openGraph: {
    type: "website",
    siteName: "Seawise Enterprise Apps — Industry Edition",
    title: "Seawise Enterprise Apps — Industry Edition",
    description:
      "ERP manufaktur kosmetik siap audit CPKB: purchase order, stok FEFO, produksi & HPP real per batch, MES, QC/QA, penjualan, dan regulasi INCI.",
    locale: "id_ID",
  },
  twitter: {
    card: "summary_large_image",
    title: "Seawise Enterprise Apps — Industry Edition",
    description:
      "ERP manufaktur kosmetik siap audit CPKB — dari PO sampai Certificate of Analysis dalam satu sistem.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TopProgress />
        {children}
      </body>
    </html>
  );
}
