/* ============================================================
   PPIC Planner: rumus kebutuhan bahan, satu untuk layar dan kertas.

   Dipakai dua tempat: layar PPIC Planner (komponen klien) dan dokumen
   cetak /print/ppic (server). Sebelum dokumen cetak ada, rumusnya
   hidup di dalam PpicPlanner.tsx. Menyalinnya ke halaman cetak berarti
   dua angka "Qty Beli" yang bisa berbeda untuk rencana yang sama, dan
   yang dibawa ke meja pembelian justru kertasnya.

   Berkas ini BERSIH dari import server (lihat bab "Batas server/klien
   di lib/" di CLAUDE.md).

   Konvensinya sama dengan PlanForm: qty bahan = % x kg ruahan, dalam
   satuan item itu sendiri. Stok yang dibandingkan adalah jumlah
   purchase_batches.qty_sisa, angka yang sama yang dipotong
   create_production.
   ============================================================ */

import { bulatkanMoq } from "@/lib/moq";

export type PpicProduct = {
  id: string;
  kode: string | null;
  nama: string;
  brand: string | null;
  kategori: string | null;
  batchKg: number;
  formulas: { item_id: string; percentage: number }[];
};

export type PpicItem = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  moq: number | null;
  stok: number;
  harga: number | null; // harga pembelian terakhir, tanpa pajak
  supplier: string | null;
};

/** Satu baris rencana: produk x jumlah batch. */
export type PpicRencana = { productId: string; batches: number };

export type PpicBarisRencana = {
  product: PpicProduct;
  batches: number;
  /** batches x ukuran batch; 0 kalau produknya belum punya ukuran batch */
  bulkKg: number;
};

/** Berapa banyak satu bahan dipakai oleh satu produk dalam rencana ini. */
export type PpicPemakaian = { product: PpicProduct; qty: number };

export type PpicBahan = {
  item: PpicItem;
  butuh: number;
  kurang: number;
  qtyBeli: number;
  dana: number | null;
  /** Produk yang memakai bahan ini, terbesar dulu. Jumlah qty-nya = butuh. */
  untuk: PpicPemakaian[];
};

export type PpicHasil = {
  /** Baris rencana yang sah (produknya ada, batch > 0), urutan apa adanya. */
  rencana: PpicBarisRencana[];
  /** Seluruh bahan yang terlibat, kekurangan terbesar dulu. */
  bahan: PpicBahan[];
  perluBeli: PpicBahan[];
  totalDana: number;
  adaTanpaHarga: boolean;
  tanpaUkuranBatch: PpicProduct[];
  /**
   * Baris rencana yang produknya tidak ada di daftar: dinonaktifkan atau
   * formulanya dihapus sesudah tautannya dibuat.
   */
  tidakDitemukan: number;
};

export function hitungPpic(
  products: PpicProduct[],
  items: PpicItem[],
  rencana: PpicRencana[]
): PpicHasil {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const itemMap = new Map(items.map((it) => [it.id, it]));

  const baris: PpicBarisRencana[] = [];
  const tanpaUkuran = new Map<string, PpicProduct>();
  let tidakDitemukan = 0;
  // item_id -> product_id -> qty
  const pakai = new Map<string, Map<string, number>>();

  for (const r of rencana) {
    if (!r.productId) continue;
    const p = productMap.get(r.productId);
    if (!p) {
      tidakDitemukan++;
      continue;
    }
    if (p.batchKg <= 0) tanpaUkuran.set(p.id, p);
    if (!(r.batches > 0)) continue;

    baris.push({
      product: p,
      batches: r.batches,
      bulkKg: p.batchKg > 0 ? p.batchKg * r.batches : 0,
    });
    if (p.batchKg <= 0) continue;

    for (const f of p.formulas) {
      const qty = (f.percentage / 100) * p.batchKg * r.batches;
      const perProduk = pakai.get(f.item_id) || new Map<string, number>();
      perProduk.set(p.id, (perProduk.get(p.id) || 0) + qty);
      pakai.set(f.item_id, perProduk);
    }
  }

  const bahan: PpicBahan[] = [];
  for (const [itemId, perProduk] of pakai) {
    const item = itemMap.get(itemId);
    if (!item) continue;
    const untuk = [...perProduk]
      .map(([pid, qty]) => ({ product: productMap.get(pid)!, qty }))
      .sort((a, b) => b.qty - a.qty);
    const butuh = untuk.reduce((s, u) => s + u.qty, 0);
    const kurang = Math.max(0, butuh - item.stok);
    const qtyBeli = bulatkanMoq(kurang, item.moq);
    bahan.push({
      item,
      butuh,
      kurang,
      qtyBeli,
      dana: item.harga != null ? qtyBeli * item.harga : null,
      untuk,
    });
  }
  bahan.sort(
    (a, b) => b.kurang - a.kurang || a.item.kode.localeCompare(b.item.kode)
  );

  const perluBeli = bahan.filter((c) => c.kurang > 0);
  return {
    rencana: baris,
    bahan,
    perluBeli,
    totalDana: perluBeli.reduce((s, c) => s + (c.dana || 0), 0),
    adaTanpaHarga: perluBeli.some((c) => c.dana == null),
    tanpaUkuranBatch: [...tanpaUkuran.values()],
    tidakDitemukan,
  };
}

/* ===== Rencana di URL =====
   PPIC Planner tidak menyimpan apa pun ke database, jadi rencananya
   dibawa lewat query `?r=<product_id>:<batch>,<product_id>:<batch>`.
   Dipakai dua arah: tautan ke dokumen cetak, dan URL layar Planner
   sendiri supaya tombol Kembali dari halaman cetak tidak mengosongkan
   rencana yang sudah disusun. */

const POLA_ID = /^[0-9a-f-]{36}$/i;
/** Batas baris yang dibaca dari URL, supaya tautan ngawur tidak membengkak. */
const MAKS_BARIS = 100;

export function rencanaKeQuery(rencana: PpicRencana[]): string {
  return rencana
    .filter((r) => r.productId && r.batches > 0)
    .map((r) => `${r.productId}:${r.batches}`)
    .join(",");
}

export function rencanaDariQuery(
  raw: string | string[] | undefined
): PpicRencana[] {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return [];
  const hasil: PpicRencana[] = [];
  for (const potong of s.split(",")) {
    const [id, n] = potong.split(":");
    const batches = Number(n);
    if (!id || !POLA_ID.test(id) || !Number.isFinite(batches) || batches <= 0) {
      continue;
    }
    hasil.push({ productId: id, batches });
    if (hasil.length >= MAKS_BARIS) break;
  }
  return hasil;
}
