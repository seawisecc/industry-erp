/* ============================================================
   Pengaturan pengesahan dokumen (kolom tanda tangan) per jenis
   dokumen cetak. Tiap dokumen punya 3 slot: Dibuat / Disetujui /
   Mengetahui, masing-masing bisa diaktifkan/dimatikan.
   Fallback: kalau belum pernah diatur, pakai 3 key person lama
   dari organization_settings (semuanya aktif).
   ============================================================ */

export const DOC_TYPES = [
  { key: "po", label: "Purchase Order" },
  { key: "receiving", label: "Penerimaan Barang" },
  { key: "purchase-return", label: "Retur Pembelian" },
  { key: "production", label: "Produksi" },
  { key: "invoice", label: "Invoice Penjualan" },
  { key: "konsinyasi", label: "Tanda Terima Konsinyasi" },
  { key: "qc", label: "Lembar Pengujian QC" },
  { key: "qa", label: "Sertifikat Analisa (QA)" },
] as const;

export type DocTypeKey = (typeof DOC_TYPES)[number]["key"];

export type SignSlot = {
  key: "dibuat" | "disetujui" | "mengetahui";
  label: string; // "Dibuat oleh," dst, tampil di dokumen
  nama: string;
  jabatan: string;
  aktif: boolean;
};

export const SLOT_DEFS: { key: SignSlot["key"]; label: string }[] = [
  { key: "dibuat", label: "Dibuat oleh," },
  { key: "disetujui", label: "Disetujui oleh," },
  { key: "mengetahui", label: "Mengetahui," },
];

export type LegacySettings = {
  sign_dibuat_nama: string | null;
  sign_dibuat_jabatan: string | null;
  sign_disetujui_nama: string | null;
  sign_disetujui_jabatan: string | null;
  sign_mengetahui_nama: string | null;
  sign_mengetahui_jabatan: string | null;
} | null;

export function defaultSlots(legacy: LegacySettings): SignSlot[] {
  return [
    {
      key: "dibuat",
      label: "Dibuat oleh,",
      nama: legacy?.sign_dibuat_nama || "",
      jabatan: legacy?.sign_dibuat_jabatan || "",
      aktif: true,
    },
    {
      key: "disetujui",
      label: "Disetujui oleh,",
      nama: legacy?.sign_disetujui_nama || "",
      jabatan: legacy?.sign_disetujui_jabatan || "",
      aktif: true,
    },
    {
      key: "mengetahui",
      label: "Mengetahui,",
      nama: legacy?.sign_mengetahui_nama || "",
      jabatan: legacy?.sign_mengetahui_jabatan || "",
      aktif: true,
    },
  ];
}


/* ============================================================
   QR Signature per jenis dokumen.

   Menunjuk salah satu slot di atas, tidak menyalin namanya,
   lihat migrasi 20260815_qr_sign_per_doc.sql untuk alasannya.
   ============================================================ */

export type QrSignDoc = {
  aktif: boolean;
  slot: SignSlot["key"];
};

export const QR_DOC_DEFAULT: QrSignDoc = { aktif: false, slot: "disetujui" };

/** Baca kolom jsonb apa adanya, tahan terhadap baris lama yang null. */
export function bacaQrDoc(v: unknown): QrSignDoc {
  const o = (v || {}) as Partial<QrSignDoc>;
  const slot = SLOT_DEFS.some((d) => d.key === o.slot)
    ? (o.slot as SignSlot["key"])
    : QR_DOC_DEFAULT.slot;
  return { aktif: o.aktif === true, slot };
}

/**
 * Slot yang benar-benar boleh mengesahkan lewat QR, atau null.
 *
 * Menolak slot yang dimatikan atau belum lengkap namanya. Kalau tidak,
 * dokumen bisa terbit dengan QR yang menunjuk pengesah kosong, tampak
 * sah tanpa ada yang bertanggung jawab, dan itu lebih buruk daripada
 * dokumen tanpa QR sama sekali.
 *
 * Ini SATU-SATUNYA tempat aturan itu ditulis: dipakai form pengaturan
 * (untuk memberi peringatan), server action (untuk menolak simpan),
 * dan halaman cetak (untuk memutuskan mencetak QR atau kolom manual).
 */
export function pengesahQr(
  slots: SignSlot[],
  qr: QrSignDoc
): SignSlot | null {
  if (!qr.aktif) return null;
  const s = slots.find((x) => x.key === qr.slot);
  if (!s || !s.aktif) return null;
  if (!s.nama.trim() || !s.jabatan.trim()) return null;
  return s;
}
