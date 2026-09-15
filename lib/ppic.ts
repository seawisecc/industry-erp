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

import { adaMoq, bulatkanMoq } from "@/lib/moq";

/**
 * Status satu bahan, dari yang paling butuh tindakan. Dihitung dari
 * JUMLAH, bukan dari ada tidaknya dokumen: butuh 100 kg dengan PO
 * 25 kg tetap "Perlu Beli", untuk sisa yang belum tertutup.
 */
export type PpicStatus =
  | "Perlu Beli"
  | "PO Belum Dikirim"
  | "Menunggu Kedatangan"
  | "Menunggu QC"
  | "Cukup";

export const URUTAN_STATUS: PpicStatus[] = [
  "Perlu Beli",
  "PO Belum Dikirim",
  "Menunggu Kedatangan",
  "Menunggu QC",
  "Cukup",
];

export type PoTerbukaStatus =
  | "Dibuat"
  | "Disetujui"
  | "Dikirim"
  | "Diterima Sebagian";

/** PO yang barangnya sudah dalam perjalanan ke gudang. */
export const PO_SUDAH_DIKIRIM: PoTerbukaStatus[] = ["Dikirim", "Diterima Sebagian"];
/**
 * PO yang belum sampai ke supplier. Tetap mengurangi Qty Beli: tanpa
 * itu PPIC menyarankan PO kedua untuk barang yang pengajuannya sudah
 * ada. PO yang ditolak atau dibatalkan keluar dari hitungan sendiri.
 */
export const PO_BELUM_DIKIRIM: PoTerbukaStatus[] = ["Dibuat", "Disetujui"];

/** Toleransi galat float saat membandingkan kebutuhan dengan persediaan. */
const TOLERANSI = 1e-9;

export type PpicProduct = {
  id: string;
  kode: string | null;
  nama: string;
  brand: string | null;
  kategori: string | null;
  batchKg: number;
  formulas: { item_id: string; percentage: number }[];
};

/** Lot yang sudah diterima tapi belum diputuskan QC. Belum boleh dipakai. */
export type PpicKarantina = {
  qty: number;
  lot: string | null;
  tanggal: string | null;
  supplier: string | null;
};

/** Baris PO yang barangnya belum datang semua. */
export type PpicPoTerbuka = {
  noPo: string | null;
  tanggal: string;
  status: PoTerbukaStatus;
  supplier: string | null;
  /** qty_pesan - qty_diterima */
  sisa: number;
};

export type PpicItem = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  moq: number | null;
  /** stok siap pakai: jumlah purchase_batches.qty_sisa */
  stok: number;
  harga: number | null; // harga pembelian terakhir, tanpa pajak
  supplier: string | null;
  karantina: PpicKarantina[];
  poTerbuka: PpicPoTerbuka[];
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
  /**
   * butuh - stok SIAP PAKAI. Sengaja tidak dikurangi karantina maupun PO:
   * yang bisa dipotong produksi hari ini cuma qty_sisa.
   */
  kurang: number;
  qtyKarantina: number;
  qtyPoDikirim: number;
  qtyPoBelumDikirim: number;
  /** Kekurangan yang belum tertutup karantina maupun PO terbuka. */
  belumDipesan: number;
  /** belumDipesan dibulatkan ke atas mengikuti MOQ. */
  qtyBeli: number;
  dana: number | null;
  status: PpicStatus;
  /** Perlu dibeli tapi MOQ belum diisi, jadi Qty Beli = belumDipesan apa adanya. */
  tanpaMoq: boolean;
  /** Produk yang memakai bahan ini, terbesar dulu. Jumlah qty-nya = butuh. */
  untuk: PpicPemakaian[];
};

export type PpicHasil = {
  /** Baris rencana yang sah (produknya ada, batch > 0), urutan apa adanya. */
  rencana: PpicBarisRencana[];
  /** Seluruh bahan yang terlibat, yang paling butuh tindakan dulu. */
  bahan: PpicBahan[];
  /** Bahan yang masih harus dipesan. */
  perluBeli: PpicBahan[];
  /** Bahan yang kurang dan sebagian atau seluruhnya sudah di karantina / PO. */
  dalamProses: PpicBahan[];
  totalDana: number;
  adaTanpaHarga: boolean;
  tanpaMoq: PpicBahan[];
  jumlahStatus: Record<PpicStatus, number>;
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

    const qtyKarantina = item.karantina.reduce((s, k) => s + k.qty, 0);
    const qtyPoDikirim = item.poTerbuka
      .filter((p) => PO_SUDAH_DIKIRIM.includes(p.status))
      .reduce((s, p) => s + p.sisa, 0);
    const qtyPoBelumDikirim = item.poTerbuka
      .filter((p) => PO_BELUM_DIKIRIM.includes(p.status))
      .reduce((s, p) => s + p.sisa, 0);

    // Tangga persediaan, dari yang paling pasti. Statusnya adalah anak
    // tangga pertama yang sudah menutup seluruh kebutuhan.
    const siap = item.stok;
    const plusQc = siap + qtyKarantina;
    const plusDikirim = plusQc + qtyPoDikirim;
    const plusSemuaPo = plusDikirim + qtyPoBelumDikirim;
    const tertutup = (n: number) => n >= butuh - TOLERANSI;
    const status: PpicStatus = tertutup(siap)
      ? "Cukup"
      : tertutup(plusQc)
        ? "Menunggu QC"
        : tertutup(plusDikirim)
          ? "Menunggu Kedatangan"
          : tertutup(plusSemuaPo)
            ? "PO Belum Dikirim"
            : "Perlu Beli";

    const kurang = status === "Cukup" ? 0 : butuh - siap;
    const belumDipesan = status === "Perlu Beli" ? butuh - plusSemuaPo : 0;
    const qtyBeli = bulatkanMoq(belumDipesan, item.moq);

    bahan.push({
      item,
      butuh,
      kurang,
      qtyKarantina,
      qtyPoDikirim,
      qtyPoBelumDikirim,
      belumDipesan,
      qtyBeli,
      dana: item.harga != null ? qtyBeli * item.harga : null,
      status,
      tanpaMoq: belumDipesan > 0 && !adaMoq(item.moq),
      untuk,
    });
  }
  bahan.sort(
    (a, b) =>
      URUTAN_STATUS.indexOf(a.status) - URUTAN_STATUS.indexOf(b.status) ||
      b.kurang - a.kurang ||
      a.item.kode.localeCompare(b.item.kode)
  );

  const perluBeli = bahan.filter((c) => c.belumDipesan > 0);
  const jumlahStatus = Object.fromEntries(
    URUTAN_STATUS.map((s) => [s, 0])
  ) as Record<PpicStatus, number>;
  for (const c of bahan) jumlahStatus[c.status]++;

  return {
    rencana: baris,
    bahan,
    perluBeli,
    dalamProses: bahan.filter(
      (c) =>
        c.kurang > 0 &&
        c.qtyKarantina + c.qtyPoDikirim + c.qtyPoBelumDikirim > 0
    ),
    totalDana: perluBeli.reduce((s, c) => s + (c.dana || 0), 0),
    adaTanpaHarga: perluBeli.some((c) => c.dana == null),
    tanpaMoq: perluBeli.filter((c) => c.tanpaMoq),
    jumlahStatus,
    tanpaUkuranBatch: [...tanpaUkuran.values()],
    tidakDitemukan,
  };
}

/**
 * Baris keterangan barang yang sedang dalam proses untuk satu bahan:
 * lot karantina dan PO terbuka. Satu sumber untuk layar dan kertas,
 * supaya nomor PO yang harus ditagih terbaca sama di keduanya.
 */
export function rincianProses(item: PpicItem): string[] {
  const f = (n: number) =>
    n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
  return [
    ...item.karantina.map(
      (k) =>
        `Karantina QC ${f(k.qty)} ${item.satuan}${k.lot ? ` · lot ${k.lot}` : ""}`
    ),
    ...item.poTerbuka.map(
      (p) =>
        `${p.noPo || "PO tanpa nomor"} · ${p.status} · sisa ${f(p.sisa)} ${item.satuan}`
    ),
  ];
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
