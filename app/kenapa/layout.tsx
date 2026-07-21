import type { Metadata } from "next";

/* Metadata khusus halaman marketing /kenapa — judul & deskripsi
   yang menjual saat link dibagikan ke calon client. */
export const metadata: Metadata = {
  title: "Kenapa Seawise? — ERP Manufaktur Siap Audit CPKB",
  description:
    "Dari PO sampai Certificate of Analysis dalam satu sistem: stok FEFO, HPP real per batch, MES, QC karantina, dan pelulusan QA. Lihat paket & harga.",
  openGraph: {
    title: "Kenapa Seawise? — ERP Manufaktur Siap Audit CPKB",
    description:
      "Dari PO sampai Certificate of Analysis dalam satu sistem: stok FEFO, HPP real per batch, MES, QC karantina, dan pelulusan QA. Lihat paket & harga.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
};

export default function KenapaLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
