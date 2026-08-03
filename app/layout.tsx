import type { Metadata } from "next";
import { Inter, Fraunces, IBM_Plex_Mono } from "next/font/google";
import TopProgress from "@/components/TopProgress";
import "./globals.css";

// Nama variabel HARUS cocok dengan @theme di globals.css
// (--font-inter / --font-fraunces / --font-plex-mono), kalau tidak
// seluruh utility font-sans/font-display/font-mono tidak menghasilkan
// apa-apa dan tampilan jatuh ke font bawaan browser.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Ganti dengan domain produksi via env NEXT_PUBLIC_SITE_URL
// (mis. https://industry.seawise.app). Di Vercel otomatis pakai URL deploy.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://industry-erp-blond.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Industry Management | Seawise Studio",
    template: "%s | Industry Management",
  },
  description:
    "ERP manufaktur siap audit CPKB: purchase order, stok FEFO, produksi & HPP real per batch, MES, QC/QA, penjualan, dan regulasi INCI.",
  openGraph: {
    type: "website",
    siteName: "Industry Management | Seawise Studio",
    title: "Industry Management | Seawise Studio",
    description:
      "ERP manufaktur siap audit CPKB: purchase order, stok FEFO, produksi & HPP real per batch, MES, QC/QA, penjualan, dan regulasi INCI.",
    locale: "id_ID",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Industry Management | Seawise Studio",
    description:
      "ERP manufaktur siap audit CPKB, dari PO sampai Certificate of Analysis dalam satu sistem.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${inter.variable} ${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TopProgress />
        {children}
      </body>
    </html>
  );
}
