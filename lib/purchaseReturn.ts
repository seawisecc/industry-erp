/* ============================================================
   Alasan retur pembelian ke supplier.

   Daftar yang sama divalidasi di create_purchase_return_tx
   (supabase/migrations/20260807_purchase_returns.sql). Kalau menambah
   alasan, ubah DUA-DUANYA — RPC menolak nilai yang tidak dikenal.
   ============================================================ */

export const ALASAN_RETUR = [
  "Rusak",
  "Tidak Sesuai Spesifikasi",
  "Ditolak QC",
  "Salah Kirim",
  "Kelebihan Kirim",
  "Lain-lain",
] as const;

export type AlasanRetur = (typeof ALASAN_RETUR)[number];

export function isAlasanRetur(v: string): v is AlasanRetur {
  return (ALASAN_RETUR as readonly string[]).includes(v);
}

export const ALASAN_TONE: Record<AlasanRetur, string> = {
  Rusak: "bg-clay-100 text-clay-600",
  "Tidak Sesuai Spesifikasi": "bg-clay-100 text-clay-600",
  "Ditolak QC": "bg-amber-100 text-amber-500",
  "Salah Kirim": "bg-amber-100 text-amber-500",
  "Kelebihan Kirim": "bg-white/70 text-muted",
  "Lain-lain": "bg-white/70 text-muted",
};

/**
 * Sisa hutang sebuah faktur pembelian setelah dipotong retur.
 *
 * Dipakai di Payments, Dashboard, dan halaman Perlu Tindakan supaya
 * ketiganya tidak menghitung sendiri-sendiri dan berbeda hasil.
 */
export function sisaHutang(totalInvoice: number, totalRetur: number): number {
  return Math.max(Number(totalInvoice) - Number(totalRetur || 0), 0);
}
