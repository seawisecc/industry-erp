/* ============================================================
   Perkiraan biaya formula R&D, dan kebutuhan bahannya kalau
   formula itu benar-benar diproduksi.

   SUMBER BAHANNYA `materials`, BUKAN `items`

   Pekerjaan R&D dimulai sebelum barangnya ada: formulator menjajaki
   bahan dari katalog supplier, memasukkannya ke formula, baru
   memutuskan mau diadakan atau tidak. Master yang cocok untuk itu
   `materials`, yang barisnya boleh ada tanpa `item_id`, dan itu
   artinya persis "belum diadakan".

   Konsekuensinya di sini: sebagian bahan formula TIDAK punya stok dan
   TIDAK punya harga, dan itu keadaan normal, bukan data rusak. Yang
   harus dijaga cuma satu, keduanya tidak boleh diam-diam dihitung
   sebagai nol tanpa keterangan.

   ANGKANYA PERKIRAAN, DAN LAYAR WAJIB MENGATAKANNYA

   Harga yang dipakai adalah harga pembelian TERAKHIR tiap bahan
   (`purchase_batches.harga_per_unit`, yaitu HPP tanpa pajak, sama
   dengan yang dibaca PPIC Planner). Biaya produksi yang sebenarnya
   baru lahir di `create_production`, yang memotong FEFO lot per lot
   dengan harga masing-masing. Jadi angka di sini bukan HPP, melainkan
   pembanding untuk memutuskan apakah sebuah formula masuk akal
   sebelum ada satu batch pun.

   SATUAN

   Persentase ditafsirkan sama persis dengan `product_formulas`:
   qty bahan = % x massa ruahan, dalam satuan item itu sendiri.
   Modul produksi sudah memakai konvensi ini (PlanForm menghitung
   `qty = (percentage / 100) * bulkKg`), jadi biaya di layar R&D
   memakai angka yang sama dengan yang nanti terpotong. Kalau
   konvensi itu berubah, ini ikut berubah.

   Ruahan dihitung dari gramasi produk: 1.000 pcs x 100 g = 100 kg.
   Kemasan tidak ikut rumus itu, dia dihitung per pcs.
   ============================================================ */

import type { ItemStok } from "./stokCek";

/**
 * Satu bahan yang bisa dipilih di formula R&D.
 *
 * Gabungan dua asal: baris `materials` (dengan atau tanpa item stok)
 * dan item stok yang tidak punya baris material sama sekali. Yang
 * kedua ada supaya bahan yang hari ini bisa dipilih tidak hilang dari
 * daftar cuma karena dulu dibuat langsung lewat menu Stock Items.
 */
export type BahanRnd = {
  /** "mat:<id>" atau "item:<id>", dipakai sebagai identitas di layar */
  key: string;
  material_id: string | null;
  /** item stok terkait; null = bahan ini belum pernah diadakan */
  item_id: string | null;
  kode: string;
  nama: string;
  satuan: string;
  kategori: "Bahan Baku" | "Kemasan";
  /** 0 untuk bahan yang belum punya item stok */
  stok: number;
  /** harga pembelian terakhir, null bila belum pernah dibeli */
  harga: number | null;
  supplier: string | null;
  /** ringkasan komposisi INCI, null bila tidak ada */
  inci: string | null;
};

/** Kunci baku satu bahan. Material menang atas item, lihat migrasi 20260824. */
export function kunciBahan(
  materialId: string | null | undefined,
  itemId: string | null | undefined
): string {
  return materialId ? `mat:${materialId}` : `item:${itemId ?? ""}`;
}

export type BarisFormula = { key: string; percentage: number };

export type BarisKemasan = {
  /** kunci bahan dari master; null = kemasan yang cuma diketik namanya */
  key: string | null;
  nama: string | null;
  qty_per_pcs: number;
  /** dipakai untuk kemasan yang belum ada di master mana pun */
  harga_estimasi: number | null;
};

export type RincianBiaya = {
  key: string | null;
  kode: string;
  nama: string;
  satuan: string;
  /** qty untuk satu satuan hitung (1 kg ruahan, atau 1 pcs kemasan) */
  qty: number;
  harga: number | null;
  subtotal: number;
  /** false = bahan ini belum punya item stok */
  adaStok: boolean;
};

export type BiayaFormula = {
  /** biaya bahan untuk 1 kg ruahan */
  bahanPerKg: number;
  rincianBahan: RincianBiaya[];
  /** biaya kemasan untuk 1 pcs produk jadi */
  kemasanPerPcs: number;
  rincianKemasan: RincianBiaya[];
  /** null bila gramasi produk belum diisi */
  bahanPerPcs: number | null;
  totalPerPcs: number | null;
  /** nama bahan/kemasan yang belum punya acuan harga sama sekali */
  tanpaHarga: string[];
};

const TIDAK_DIKENAL = { kode: "-", nama: "Bahan tidak dikenal", satuan: "" };

/**
 * Biaya satu formula.
 *
 * `nettoGram` = gramasi produk jadi per pcs. Selama belum diisi,
 * biaya per pcs sengaja null, bukan nol: nol terbaca sebagai "produk
 * ini gratis", dan itu angka yang bisa terbawa ke penawaran harga.
 */
export function hitungBiayaFormula(
  formula: readonly BarisFormula[],
  kemasan: readonly BarisKemasan[],
  nettoGram: number | null,
  bahanOf: (key: string) => BahanRnd | undefined
): BiayaFormula {
  const tanpaHarga: string[] = [];

  const rincianBahan: RincianBiaya[] = [];
  let bahanPerKg = 0;
  for (const f of formula) {
    if (!f.key || !(f.percentage > 0)) continue;
    const b = bahanOf(f.key);
    const qty = f.percentage / 100; // per 1 kg ruahan
    const harga = b?.harga ?? null;
    const subtotal = harga == null ? 0 : qty * harga;
    bahanPerKg += subtotal;
    if (harga == null) tanpaHarga.push(b?.nama ?? TIDAK_DIKENAL.nama);
    rincianBahan.push({
      key: f.key,
      kode: b?.kode ?? TIDAK_DIKENAL.kode,
      nama: b?.nama ?? TIDAK_DIKENAL.nama,
      satuan: b?.satuan ?? TIDAK_DIKENAL.satuan,
      qty,
      harga,
      subtotal,
      adaStok: !!b?.item_id,
    });
  }

  const rincianKemasan: RincianBiaya[] = [];
  let kemasanPerPcs = 0;
  for (const k of kemasan) {
    const qty = Number(k.qty_per_pcs) || 0;
    if (qty <= 0) continue;
    const b = k.key ? bahanOf(k.key) : undefined;
    // Kemasan yang belum ada di master mana pun boleh diketik harganya
    // tangan; yang sudah ada memakai harga pembelian terakhirnya.
    const harga = b?.harga ?? k.harga_estimasi ?? null;
    const nama = b?.nama ?? k.nama ?? TIDAK_DIKENAL.nama;
    const subtotal = harga == null ? 0 : qty * harga;
    kemasanPerPcs += subtotal;
    if (harga == null) tanpaHarga.push(nama);
    rincianKemasan.push({
      key: k.key,
      kode: b?.kode ?? "-",
      nama,
      satuan: b?.satuan ?? "pcs",
      qty,
      harga,
      subtotal,
      adaStok: !!b?.item_id,
    });
  }

  const bahanPerPcs =
    nettoGram && nettoGram > 0 ? (bahanPerKg * nettoGram) / 1000 : null;

  return {
    bahanPerKg,
    rincianBahan,
    kemasanPerPcs,
    rincianKemasan,
    bahanPerPcs,
    totalPerPcs: bahanPerPcs == null ? null : bahanPerPcs + kemasanPerPcs,
    tanpaHarga: Array.from(new Set(tanpaHarga)),
  };
}

export type Kebutuhan = {
  /** massa ruahan yang harus dibuat, kg */
  ruahanKg: number;
  /** qty per ITEM STOK, siap dipakai hitungKekurangan */
  perItem: Map<string, number>;
  /**
   * Bahan yang belum punya item stok, qty per kunci bahan.
   *
   * Dipisah, TIDAK digabung ke `perItem` sebagai stok nol, karena
   * dua-duanya butuh tindakan yang berbeda: yang di `perItem` tinggal
   * dibelikan lagi, yang di sini harus didaftarkan dulu jadi item
   * sebelum bisa dibeli sama sekali. Menyamakannya membuat kalimat
   * "kurang 12 kg" muncul untuk barang yang bahkan belum punya tempat
   * di gudang.
   */
  belumAdaStok: Map<string, number>;
};

/**
 * Kebutuhan bahan kalau formula ini diproduksi sekian pcs.
 *
 * Kemasan yang tidak menunjuk master apa pun (cuma nama ketikan)
 * tidak ikut sama sekali: dia tidak punya identitas yang bisa
 * dilacak ke mana pun.
 */
export function kebutuhanProduksi(
  formula: readonly BarisFormula[],
  kemasan: readonly BarisKemasan[],
  pcs: number,
  nettoGram: number | null,
  bahanOf: (key: string) => BahanRnd | undefined
): Kebutuhan {
  const perItem = new Map<string, number>();
  const belumAdaStok = new Map<string, number>();
  const ruahanKg =
    pcs > 0 && nettoGram && nettoGram > 0 ? (pcs * nettoGram) / 1000 : 0;

  function catat(key: string, qty: number) {
    if (!(qty > 0)) return;
    const itemId = bahanOf(key)?.item_id;
    const target = itemId ? perItem : belumAdaStok;
    const kunci = itemId ?? key;
    target.set(kunci, (target.get(kunci) || 0) + qty);
  }

  if (ruahanKg > 0) {
    for (const f of formula) {
      if (!f.key || !(f.percentage > 0)) continue;
      catat(f.key, (f.percentage / 100) * ruahanKg);
    }
  }

  if (pcs > 0) {
    for (const k of kemasan) {
      if (!k.key) continue;
      catat(k.key, (Number(k.qty_per_pcs) || 0) * pcs);
    }
  }

  return { ruahanKg, perItem, belumAdaStok };
}

/** Bentuk `ItemStok` untuk `hitungKekurangan`, dari satu bahan. */
export function keItemStok(b: BahanRnd): ItemStok {
  return {
    id: b.item_id ?? b.key,
    kode: b.kode,
    nama: b.nama,
    satuan: b.satuan,
    stok: b.stok,
  };
}

/**
 * Takaran satu batch trial di lab, dalam gram, per kunci bahan.
 *
 * Dibiarkan apa adanya (tanpa pembulatan) karena timbangan analitik
 * memang membaca sampai dua desimal, dan membulatkan di sini akan
 * membuat jumlah kolomnya tidak lagi sama dengan ukuran batchnya.
 */
export function takaranTrial(
  formula: readonly BarisFormula[],
  trialGram: number | null
): Map<string, number> {
  const out = new Map<string, number>();
  if (!trialGram || trialGram <= 0) return out;
  for (const f of formula) {
    if (!f.key || !(f.percentage > 0)) continue;
    out.set(f.key, (f.percentage / 100) * trialGram);
  }
  return out;
}
