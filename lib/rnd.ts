/* ============================================================
   Modul R&D Formulation: status, silsilah revisi, dan bentuk data
   yang dipakai bersama layar maupun server action.

   File ini BERSIH dari import server (lihat bab Batas server/klien
   di CLAUDE.md), karena form develop dan panel biaya keduanya
   komponen klien.
   ============================================================ */

import { PARAM_STANDAR } from "./qcParams";

/* ============================================================
   Status.

   Empat keadaan, dan dua di antaranya membekukan dokumennya:

   - Draft     baru disusun, belum turun ke lab
   - Trial     hasil percobaan sudah mulai dicatat
   - Disetujui formula yang dipakai. DIBEKUKAN
   - Arsip     versi yang dulu dipakai lalu digantikan revisi. DIBEKUKAN

   Yang membekukan bukan kerapian: nomor formula yang disetujui akan
   ditulis di batch record produksi, dan angka yang ditunjuk nomor itu
   tidak boleh bergerak sesudahnya. Perubahan lewat revisi, yang
   nomornya sendiri berbeda.

   `Disetujui` berhenti di situ, sebagai PENANDA. Dia tidak menerbitkan
   produk, tidak memotong stok, dan tidak memicu apa pun di modul lain;
   penurunan ke master Products dikerjakan tangan.
   ============================================================ */

export const RND_STATUS = ["Draft", "Trial", "Disetujui", "Arsip"] as const;

export type RndStatus = (typeof RND_STATUS)[number];

/** true = dokumennya potret keputusan, tidak boleh disunting lagi. */
export function statusBeku(status: string): boolean {
  return status === "Disetujui" || status === "Arsip";
}

/** Kelas pil status. Disetujui sengaja paling mencolok. */
export function klasStatusRnd(status: string): string {
  switch (status) {
    case "Disetujui":
      return "bg-botanical-700 text-white";
    case "Trial":
      return "bg-amber-100 text-amber-500";
    case "Arsip":
      return "bg-line text-muted";
    default:
      return "bg-clay-100 text-clay-600";
  }
}

/* ============================================================
   Nomor & silsilah.

   Induk bernomor RND.YYYYMM###, revisinya menambahkan "-R<n>".
   Penomorannya dikerjakan SQL (`save_rnd_formula_tx` dan
   `revise_rnd_formula_tx`); yang di sini cuma pembacanya, supaya
   layar tidak perlu mengurai teks nomor sendiri.
   ============================================================ */

/** "RND.202609001-R2" -> "Revisi 2"; revisi 0 -> "Asli". */
export function labelRevisi(revisi: number): string {
  return revisi === 0 ? "Asli" : `Revisi ${revisi}`;
}

/**
 * Satu baris formula.
 *
 * `material_id` ATAU `item_id`, tidak pernah dua-duanya: bahan yang
 * berasal dari master material disimpan sebagai material, dan kaitannya
 * ke stok dibaca lewat `materials.item_id` saat diperlukan. Kalau
 * kaitannya ikut dibekukan di sini, material yang BARU diadakan bulan
 * depan tidak akan pernah nyambung ke formula yang sudah tersimpan.
 * Constraint-nya dijaga di database (migrasi 20260824).
 */
export type FormulaItemInput = {
  material_id: string | null;
  item_id: string | null;
  fase: string | null;
  percentage: number;
  fungsi: string | null;
  catatan: string | null;
};

export type SpecInput = {
  id?: string;
  urutan: number;
  grup: string | null;
  parameter: string;
  satuan: string | null;
  target: string | null;
  hasil: string | null;
};

/**
 * Satu baris rencana kemasan.
 *
 * Aturannya sama dengan baris formula, dengan satu kelonggaran:
 * kemasan boleh TIDAK menunjuk master apa pun dan cuma membawa nama
 * ketikan. Kemasan yang sedang dijajaki sering belum punya kode di
 * mana-mana, dan memaksa mendaftarkannya dulu cuma untuk menghitung
 * perkiraan biaya akan mengotori master dengan barang yang batal.
 */
export type PackagingInput = {
  material_id: string | null;
  item_id: string | null;
  nama: string | null;
  qty_per_pcs: number;
  harga_estimasi: number | null;
};

export type RndHeaderInput = {
  nama_produk: string;
  brand: string | null;
  client_id: string | null;
  tanggal_develop: string; // yyyy-mm-dd, dihitung di sisi aplikasi
  trial_gram: number | null;
  netto_gram: number | null;
  catatan: string | null;
};

/* ============================================================
   Spesifikasi target bawaan.

   Diambil dari master parameter QC produk jadi, BUKAN daftar baru:
   spek yang ditargetkan R&D adalah spek yang nanti diuji QC. Dua
   daftar yang berbeda berarti formula lulus di lab R&D lalu ditolak
   QC karena parameternya memang tidak pernah sama.
   ============================================================ */
export function specBawaan(): SpecInput[] {
  return PARAM_STANDAR.produk_jadi
    .filter((p) => p.aktif && p.grup !== "Mikrobiologi")
    .map((p, i) => ({
      urutan: i,
      grup: p.grup,
      parameter: p.nama,
      satuan: p.satuan,
      target: p.spesifikasi,
      hasil: null,
    }));
}
