/* ============================================================
   Feature flags per perusahaan — dasar untuk paket bertingkat
   (mis. MES mode untuk pabrik yang siap eksekusi digital).
   Disimpan di organization_settings.features (jsonb).
   ============================================================ */

export const FEATURES = [
  {
    key: "mes",
    label: "MES Mode",
    desc: "Eksekusi produksi digital: langkah cara pembuatan jadi checklist di layar, timestamp & operator terekam otomatis di batch record.",
    ready: true,
  },
  {
    key: "qc",
    label: "QC Module",
    desc: "Barang masuk dikarantina dulu — hanya bisa dipakai produksi setelah di-release QC. Reject otomatis ter-audit.",
    ready: true,
  },
  {
    key: "qa",
    label: "QA Release",
    desc: "Batch produksi berstatus Hold sampai di-release QA — sebelum itu produk jadi tidak muncul di stok jual (konsinyasi, invoice, POS).",
    ready: true,
  },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];

export type FeatureFlags = Record<FeatureKey, boolean>;

export function parseFeatures(raw: unknown): FeatureFlags {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    mes: obj.mes === true,
    qc: obj.qc === true,
    qa: obj.qa === true,
  };
}
