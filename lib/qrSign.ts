/* ============================================================
   QR Signature (non-certified), bagian yang boleh dipakai klien.

   File ini bersih dari import server (lihat "Batas server/klien di
   lib/" pada CLAUDE.md), karena form pengaturannya "use client".
   Perhitungan sidik dokumen & pembuatan gambar QR ada di
   lib/qrSignServer.ts.

   Apa yang DIJANJIKAN tanda tangan ini, supaya tidak ada yang salah
   paham: dia membuktikan selembar kertas benar-benar terbit dari
   sistem ini, atas dokumen yang masih ada, dengan nomor & tanggal
   yang tercetak di badannya. Itu saja.

   Apa yang TIDAK dijanjikan: ini bukan tanda tangan elektronik
   tersertifikasi. Tidak ada PSrE, tidak ada sertifikat, tidak ada
   kunci privat milik perorangan. Kalimat "Non-Certified" wajib ikut
   tercetak di dokumennya, pengesahan yang mengaku lebih dari
   kemampuannya lebih berbahaya daripada tidak ada pengesahan.

   Siapa pengesah tiap dokumen TIDAK ada di sini, melainkan di
   lib/docSign.ts (`QrSignDoc`, `pengesahQr`): dia menunjuk salah satu
   kolom tanda tangan dokumen itu sendiri, bukan identitas terpisah.
   ============================================================ */

import type { DocTypeKey } from "@/lib/docSign";

/**
 * Jenis dokumen yang bisa diverifikasi.
 *
 * Lebih banyak daripada DocTypeKey karena "Lembar Uji Produk Jadi"
 * dicetak dari halaman sendiri walau berbagi pengaturan kolom tanda
 * tangan dengan lembar uji bahan. Kalau dia dipaksa memakai kunci
 * "qa", sidiknya akan sama persis dengan CoA batch yang sama, dua
 * dokumen berbeda dengan satu sidik, dan halaman verifikasi akan
 * menyebut lembar uji sebagai sertifikat analisa.
 */
export type VerifyKey = DocTypeKey | "qc-produk";

/** Nama dokumen yang tampil di halaman verifikasi. */
export const JUDUL_DOKUMEN: Record<VerifyKey, string> = {
  po: "Purchase Order",
  receiving: "Bukti Penerimaan Barang",
  "purchase-return": "Nota Retur Pembelian",
  production: "Batch Record Produksi",
  invoice: "Invoice Penjualan",
  konsinyasi: "Tanda Terima Konsinyasi",
  qc: "Lembar Pengujian QC",
  qa: "Sertifikat Analisa (CoA)",
  "qc-produk": "Lembar Uji Produk Jadi",
};

/**
 * Sidik dokumen yang tercetak & ditampilkan: "7K2M-9QX4-A1B8".
 *
 * Formatnya berkelompok 4 supaya bisa dibacakan lewat telepon dan
 * dicocokkan mata tanpa kehilangan tempat.
 */
export function formatSidik(hex: string): string {
  const b32 = hex
    .toUpperCase()
    // Huruf yang gampang tertukar saat dibacakan orang dibuang.
    .replace(/[^0-9A-F]/g, "")
    .slice(0, 12);
  return (b32.match(/.{1,4}/g) || []).join("-");
}
