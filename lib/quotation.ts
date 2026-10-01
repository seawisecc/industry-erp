/* ============================================================
   Quotation: tipe & aturan kecil yang dipakai layar maupun server.

   Bersih dari import server, jadi form klien dan server action
   memakai nama yang sama (lihat bab Batas server/klien di CLAUDE.md).
   ============================================================ */

export const STATUS_QUOTATION = ["Draft", "Terkirim", "Diterima", "Ditolak"] as const;

export type StatusQuotation = (typeof STATUS_QUOTATION)[number];

export function adalahStatusQuotation(v: string): v is StatusQuotation {
  return (STATUS_QUOTATION as readonly string[]).includes(v);
}

export type QuotationItemInput = {
  deskripsi: string;
  keterangan: string | null;
  satuan: string | null;
  qty: number;
  harga: number;
};

export type QuotationHeaderInput = {
  client_id: string | null;
  nama_penerima: string | null;
  up: string | null;
  perihal: string | null;
  tanggal: string;
  berlaku_sampai: string | null;
  diskon_percent: number;
  pakai_tax: boolean;
  syarat: string | null;
};

/** Masa berlaku bawaan quotation baru, dalam hari. */
export const BERLAKU_HARI_DEFAULT = 30;

/**
 * Kedaluwarsa dihitung, tidak disimpan. Yang sudah Diterima/Ditolak
 * tidak pernah kedaluwarsa: keputusannya sudah ada.
 */
export function kedaluwarsa(
  status: string,
  berlakuSampai: string | null,
  hariIni: string
): boolean {
  if (!berlakuSampai) return false;
  if (status !== "Draft" && status !== "Terkirim") return false;
  return berlakuSampai < hariIni;
}

/** Kelas pil status, dipakai daftar & halaman detail. */
export function klasStatusQuotation(status: string, lewat: boolean): string {
  if (lewat) return "bg-line text-muted";
  switch (status) {
    case "Terkirim":
      return "bg-amber-100 text-amber-500";
    case "Diterima":
      return "bg-botanical-700 text-white";
    case "Ditolak":
      return "bg-clay-100 text-clay-600";
    default:
      return "bg-white/70 text-muted border border-line";
  }
}

/** Quotation boleh disunting selama belum diputuskan dan belum jadi Proforma. */
export function quotationBisaDisunting(
  status: string,
  invoiceId: string | null
): boolean {
  return !invoiceId && (status === "Draft" || status === "Terkirim");
}
