/* ============================================================
   Perkiraan biaya formula R&D, dan kebutuhan bahannya kalau
   formula itu benar-benar diproduksi.

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

/** Item dengan harga & supplier, bentuk yang dibaca layar R&D. */
export type ItemRnd = ItemStok & {
  kategori: "Bahan Baku" | "Kemasan";
  /** harga pembelian terakhir, null bila bahan ini belum pernah dibeli */
  harga: number | null;
  supplier: string | null;
};

export type BarisFormula = { item_id: string; percentage: number };

export type BarisKemasan = {
  item_id: string | null;
  nama: string | null;
  qty_per_pcs: number;
  /** dipakai untuk kemasan yang belum ada di master item */
  harga_estimasi: number | null;
};

export type RincianBiaya = {
  item_id: string | null;
  kode: string;
  nama: string;
  satuan: string;
  /** qty untuk satu satuan hitung (1 kg ruahan, atau 1 pcs kemasan) */
  qty: number;
  harga: number | null;
  subtotal: number;
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

const TIDAK_DIKENAL = { kode: "-", nama: "Item tidak dikenal", satuan: "" };

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
  itemOf: (id: string) => ItemRnd | undefined
): BiayaFormula {
  const tanpaHarga: string[] = [];

  const rincianBahan: RincianBiaya[] = [];
  let bahanPerKg = 0;
  for (const f of formula) {
    if (!f.item_id || !(f.percentage > 0)) continue;
    const it = itemOf(f.item_id);
    const qty = f.percentage / 100; // per 1 kg ruahan
    const harga = it?.harga ?? null;
    const subtotal = harga == null ? 0 : qty * harga;
    bahanPerKg += subtotal;
    if (harga == null) tanpaHarga.push(it?.nama ?? TIDAK_DIKENAL.nama);
    rincianBahan.push({
      item_id: f.item_id,
      kode: it?.kode ?? TIDAK_DIKENAL.kode,
      nama: it?.nama ?? TIDAK_DIKENAL.nama,
      satuan: it?.satuan ?? TIDAK_DIKENAL.satuan,
      qty,
      harga,
      subtotal,
    });
  }

  const rincianKemasan: RincianBiaya[] = [];
  let kemasanPerPcs = 0;
  for (const k of kemasan) {
    const qty = Number(k.qty_per_pcs) || 0;
    if (qty <= 0) continue;
    const it = k.item_id ? itemOf(k.item_id) : undefined;
    // Kemasan yang belum ada di master boleh diketik harganya tangan;
    // yang sudah ada memakai harga pembelian terakhirnya.
    const harga = it?.harga ?? k.harga_estimasi ?? null;
    const nama = it?.nama ?? k.nama ?? TIDAK_DIKENAL.nama;
    const subtotal = harga == null ? 0 : qty * harga;
    kemasanPerPcs += subtotal;
    if (harga == null) tanpaHarga.push(nama);
    rincianKemasan.push({
      item_id: k.item_id,
      kode: it?.kode ?? "-",
      nama,
      satuan: it?.satuan ?? "pcs",
      qty,
      harga,
      subtotal,
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
  /** qty per item, satuan item masing-masing; siap dipakai hitungKekurangan */
  perItem: Map<string, number>;
};

/**
 * Kebutuhan bahan kalau formula ini diproduksi sekian pcs.
 *
 * Kemasan tanpa `item_id` (yang belum ada di master) TIDAK ikut:
 * barangnya belum punya stok yang bisa dibandingkan, dan menghitungnya
 * sebagai stok nol akan menghasilkan peringatan "kurang" untuk barang
 * yang memang belum pernah dibeli. Itu bukan kabar baru buat siapa pun.
 */
export function kebutuhanProduksi(
  formula: readonly BarisFormula[],
  kemasan: readonly BarisKemasan[],
  pcs: number,
  nettoGram: number | null
): Kebutuhan {
  const perItem = new Map<string, number>();
  const ruahanKg =
    pcs > 0 && nettoGram && nettoGram > 0 ? (pcs * nettoGram) / 1000 : 0;

  if (ruahanKg > 0) {
    for (const f of formula) {
      if (!f.item_id || !(f.percentage > 0)) continue;
      const qty = (f.percentage / 100) * ruahanKg;
      perItem.set(f.item_id, (perItem.get(f.item_id) || 0) + qty);
    }
  }

  if (pcs > 0) {
    for (const k of kemasan) {
      if (!k.item_id) continue;
      const qty = (Number(k.qty_per_pcs) || 0) * pcs;
      if (qty <= 0) continue;
      perItem.set(k.item_id, (perItem.get(k.item_id) || 0) + qty);
    }
  }

  return { ruahanKg, perItem };
}

/**
 * Takaran satu batch trial di lab, dalam gram.
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
    if (!f.item_id || !(f.percentage > 0)) continue;
    out.set(f.item_id, ((f.percentage / 100) * trialGram));
  }
  return out;
}
