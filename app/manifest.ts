import type { MetadataRoute } from "next";

// Next 16 menerbitkan file ini di /manifest.webmanifest dan menyisipkan
// <link rel="manifest"> ke seluruh halaman secara otomatis.
//
// Dua hal yang menentukan aplikasinya bisa dipasang lewat Chrome atau tidak,
// dan dua-duanya gampang rusak tanpa sadar:
//
// 1. Manifest diambil browser TANPA cookie, jadi /manifest.webmanifest harus
//    dikecualikan dari proxy auth. Kalau tidak, browser cuma menerima
//    redirect ke /login dan tombol "Install" tidak pernah muncul.
// 2. start_url wajib "/" , bukan halaman tetap. Lihat bab hak akses modul di
//    CLAUDE.md: user yang tidak punya akses Dashboard akan terjebak di layar
//    "Tidak Punya Akses" setiap kali membuka aplikasi dari home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Industry Management | Seawise Studio",
    short_name: "Industry ERP",
    description:
      "ERP manufaktur siap audit CPKB: purchase order, stok FEFO, produksi & HPP real per batch, MES, QC/QA, penjualan, dan regulasi INCI.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#EDE9E0",
    theme_color: "#1E3327",
    lang: "id",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Android memotong ikon jadi lingkaran atau kotak membulat. Versi
      // maskable punya latar penuh dan logo di 58% tengah, supaya tidak
      // ada bagian yang terpotong.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
