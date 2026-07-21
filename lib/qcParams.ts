/* ============================================================
   Master parameter uji QC — tipe, kategori, dan daftar standar.
   File netral (bukan "use server") supaya bisa dipakai komponen
   client maupun server action.
   ============================================================ */

export const QC_KATEGORI = [
  { key: "bahan_baku", label: "Bahan Baku" },
  { key: "bahan_kemas", label: "Bahan Kemas" },
  { key: "ipc", label: "IPC / Produk Ruahan" },
  { key: "produk_jadi", label: "Produk Jadi" },
] as const;

export type QcKategoriKey = (typeof QC_KATEGORI)[number]["key"];

export type QcParamInput = {
  id?: string;
  kategori: QcKategoriKey;
  nama: string;
  satuan: string | null;
  spesifikasi: string | null;
  grup: string | null; // Organoleptis / Fisikokimia / Mikrobiologi
  aktif: boolean;
};

export const GRUP_SARAN = [
  "Organoleptis",
  "Fisikokimia",
  "Mikrobiologi",
  "Fisik",
  "Lainnya",
];

// Parameter standar per kategori — dipakai tombol "Isi Parameter Standar"
export const PARAM_STANDAR: Record<QcKategoriKey, Omit<QcParamInput, "id">[]> = {
  bahan_baku: [
    { kategori: "bahan_baku", nama: "Warna", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: true },
    { kategori: "bahan_baku", nama: "Bau", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: true },
    { kategori: "bahan_baku", nama: "Bentuk", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: true },
    { kategori: "bahan_baku", nama: "Rasa", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: false },
    { kategori: "bahan_baku", nama: "pH", satuan: null, spesifikasi: null, grup: "Fisikokimia", aktif: true },
    { kategori: "bahan_baku", nama: "Massa Jenis", satuan: "g/mL", spesifikasi: null, grup: "Fisikokimia", aktif: true },
    { kategori: "bahan_baku", nama: "Viskositas", satuan: "cP", spesifikasi: null, grup: "Fisikokimia", aktif: true },
    { kategori: "bahan_baku", nama: "Angka Lempeng Total", satuan: "koloni/g", spesifikasi: "< 10^3", grup: "Mikrobiologi", aktif: true },
    { kategori: "bahan_baku", nama: "Angka Kapang Khamir", satuan: "koloni/g", spesifikasi: "< 10^2", grup: "Mikrobiologi", aktif: true },
    { kategori: "bahan_baku", nama: "Candida albicans", satuan: null, spesifikasi: "Negatif", grup: "Mikrobiologi", aktif: true },
    { kategori: "bahan_baku", nama: "Staphylococcus aureus", satuan: null, spesifikasi: "Negatif", grup: "Mikrobiologi", aktif: true },
    { kategori: "bahan_baku", nama: "Pseudomonas aeruginosa", satuan: null, spesifikasi: "Negatif", grup: "Mikrobiologi", aktif: true },
  ],
  bahan_kemas: [
    { kategori: "bahan_kemas", nama: "Warna", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: true },
    { kategori: "bahan_kemas", nama: "Bentuk", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: true },
    { kategori: "bahan_kemas", nama: "Dimensi", satuan: "mm", spesifikasi: null, grup: "Fisik", aktif: true },
    { kategori: "bahan_kemas", nama: "Bobot", satuan: "g", spesifikasi: null, grup: "Fisik", aktif: true },
    { kategori: "bahan_kemas", nama: "Kebocoran", satuan: null, spesifikasi: "Tidak bocor", grup: "Fisik", aktif: true },
    { kategori: "bahan_kemas", nama: "Kesesuaian Artwork", satuan: null, spesifikasi: "Sesuai", grup: "Fisik", aktif: true },
    { kategori: "bahan_kemas", nama: "Kebersihan", satuan: null, spesifikasi: "Bersih", grup: "Fisik", aktif: true },
  ],
  ipc: [
    { kategori: "ipc", nama: "Warna", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: true },
    { kategori: "ipc", nama: "Bau", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: true },
    { kategori: "ipc", nama: "Bentuk", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: true },
    { kategori: "ipc", nama: "Homogenitas", satuan: null, spesifikasi: "Homogen", grup: "Fisikokimia", aktif: true },
    { kategori: "ipc", nama: "pH", satuan: null, spesifikasi: null, grup: "Fisikokimia", aktif: true },
    { kategori: "ipc", nama: "Viskositas", satuan: "cP", spesifikasi: null, grup: "Fisikokimia", aktif: true },
    { kategori: "ipc", nama: "Massa Jenis", satuan: "g/mL", spesifikasi: null, grup: "Fisikokimia", aktif: true },
  ],
  produk_jadi: [
    { kategori: "produk_jadi", nama: "Warna", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: true },
    { kategori: "produk_jadi", nama: "Bau", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: true },
    { kategori: "produk_jadi", nama: "Bentuk", satuan: null, spesifikasi: null, grup: "Organoleptis", aktif: true },
    { kategori: "produk_jadi", nama: "pH", satuan: null, spesifikasi: null, grup: "Fisikokimia", aktif: true },
    { kategori: "produk_jadi", nama: "Viskositas", satuan: "cP", spesifikasi: null, grup: "Fisikokimia", aktif: true },
    { kategori: "produk_jadi", nama: "Massa Jenis", satuan: "g/mL", spesifikasi: null, grup: "Fisikokimia", aktif: true },
    { kategori: "produk_jadi", nama: "Volume/Bobot Isi", satuan: null, spesifikasi: null, grup: "Fisik", aktif: true },
    { kategori: "produk_jadi", nama: "Angka Lempeng Total", satuan: "koloni/g", spesifikasi: "< 10^3", grup: "Mikrobiologi", aktif: true },
    { kategori: "produk_jadi", nama: "Angka Kapang Khamir", satuan: "koloni/g", spesifikasi: "< 10^2", grup: "Mikrobiologi", aktif: true },
    { kategori: "produk_jadi", nama: "Candida albicans", satuan: null, spesifikasi: "Negatif", grup: "Mikrobiologi", aktif: true },
    { kategori: "produk_jadi", nama: "Staphylococcus aureus", satuan: null, spesifikasi: "Negatif", grup: "Mikrobiologi", aktif: true },
    { kategori: "produk_jadi", nama: "Pseudomonas aeruginosa", satuan: null, spesifikasi: "Negatif", grup: "Mikrobiologi", aktif: true },
  ],
};
