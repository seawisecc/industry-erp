/* ============================================================
   Kategori tujuan Pemakaian Bahan.

   Sengaja enum di aplikasi, bukan tabel master: daftarnya pendek,
   jarang berubah, dan tiap kategori punya arti tetap di laporan.
   Tabel master hanya menambah satu halaman CRUD yang tidak pernah
   dipakai.

   Daftar yang sama divalidasi di create_material_issue_tx
   (supabase/migrations/20260805_material_issues.sql). Kalau menambah
   kategori, ubah DUA-DUANYA. RPC menolak nilai yang tidak dikenal.
   ============================================================ */

export const TUJUAN_PEMAKAIAN = [
  "R&D",
  "Cleaning & Sanitasi",
  "Sampel",
  "Rusak / Tumpah",
  "Lain-lain",
] as const;

export type TujuanPemakaian = (typeof TUJUAN_PEMAKAIAN)[number];

export function isTujuanPemakaian(v: string): v is TujuanPemakaian {
  return (TUJUAN_PEMAKAIAN as readonly string[]).includes(v);
}

/** Warna pil status per tujuan, dipakai di daftar & detail. */
export const TUJUAN_TONE: Record<TujuanPemakaian, string> = {
  "R&D": "bg-botanical-100 text-botanical-700",
  "Cleaning & Sanitasi": "bg-white/70 text-muted",
  Sampel: "bg-amber-100 text-amber-500",
  "Rusak / Tumpah": "bg-clay-100 text-clay-600",
  "Lain-lain": "bg-white/70 text-muted",
};
