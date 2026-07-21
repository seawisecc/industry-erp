/* ============================================================
   Pengaturan pengesahan dokumen (kolom tanda tangan) per jenis
   dokumen cetak. Tiap dokumen punya 3 slot: Dibuat / Disetujui /
   Mengetahui — masing-masing bisa diaktifkan/dimatikan.
   Fallback: kalau belum pernah diatur, pakai 3 key person lama
   dari organization_settings (semuanya aktif).
   ============================================================ */

export const DOC_TYPES = [
  { key: "po", label: "Purchase Order" },
  { key: "receiving", label: "Penerimaan Barang" },
  { key: "production", label: "Produksi" },
  { key: "invoice", label: "Invoice Penjualan" },
  { key: "qc", label: "Lembar Pengujian QC" },
  { key: "qa", label: "Sertifikat Analisa (QA)" },
] as const;

export type DocTypeKey = (typeof DOC_TYPES)[number]["key"];

export type SignSlot = {
  key: "dibuat" | "disetujui" | "mengetahui";
  label: string; // "Dibuat oleh," dst — tampil di dokumen
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

