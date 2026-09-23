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

   Neraca satu bahan:

     Kekurangan = Plan Berjalan + Kebutuhan PPIC - Stok Sisa

   Plan Berjalan adalah jatah Plan Produksi yang sudah disimpan tapi
   belum Input Hasil. Stoknya belum terpotong (create_production baru
   memotong di akhir), jadi tanpa komponen ini dua rencana bisa
   sama-sama bilang "Cukup" untuk bahan yang cuma cukup untuk salah
   satunya.
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

export type PlanTerbukaStatus = "Direncanakan" | "Sedang Produksi";
/** Plan yang bahannya belum terpotong: belum Input Hasil. */
export const PLAN_TERBUKA: PlanTerbukaStatus[] = ["Direncanakan", "Sedang Produksi"];

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

/** Plan Produksi yang sudah disimpan tapi bahannya belum terpotong. */
export type PpicPlanTerbuka = {
  id: string;
  noBatch: string;
  status: PlanTerbukaStatus;
  tanggal: string | null;
  produk: string;
  brand: string | null;
  jumlahBatch: number;
  /** true = jatah dari data penimbangan, false = hitungan formula */
  dariTimbangan: boolean;
  /** Jatah bahan per item, sudah digabung. */
  jatah: { item_id: string; qty: number }[];
};

/** Bentuk minimum execution_data yang dibaca untuk menghitung jatah. */
export type EksekusiRingkas = {
  bahan?: { item_id: string; teoritis?: number; real?: number }[] | null;
  kemasan?: { item_id: string; qty?: number }[] | null;
  adjust?: { item_id: string; qty?: number }[] | null;
};

/**
 * Jatah bahan satu Plan Produksi yang belum Input Hasil.
 *
 * Cerminan `finishProduction`: yang dipotong di sana adalah bahan
 * formula (timbangan real) + kemasan + adjusting. Bedanya satu, dan
 * disengaja: bahan yang BELUM ditimbang (real 0) dihitung dengan angka
 * teoritisnya, karena bahan itu tetap akan dipakai, cuma belum dicatat.
 *
 * Plan yang belum punya data penimbangan dihitung dari formula produk
 * yang berlaku sekarang, sama dengan PlanForm. Kemasannya belum bisa
 * dihitung di tahap itu (pcs per varian baru diisi di layar Execution).
 */
export function hitungJatahPlan(arg: {
  jumlahBatch: number;
  batchKg: number;
  formulas: { item_id: string; percentage: number }[];
  eksekusi: EksekusiRingkas | null;
}): { dariTimbangan: boolean; jatah: { item_id: string; qty: number }[] } {
  const total = new Map<string, number>();
  const tambah = (id: string, qty: number) => {
    if (id && qty > 0) total.set(id, (total.get(id) || 0) + qty);
  };

  const e = arg.eksekusi;
  const dariTimbangan = !!e && Array.isArray(e.bahan);
  if (dariTimbangan) {
    for (const b of e!.bahan!) {
      const real = Number(b.real) || 0;
      tambah(b.item_id, real > 0 ? real : Number(b.teoritis) || 0);
    }
    for (const k of e!.kemasan || []) tambah(k.item_id, Number(k.qty) || 0);
    for (const a of e!.adjust || []) tambah(a.item_id, Number(a.qty) || 0);
  } else {
    const kg = arg.batchKg * arg.jumlahBatch;
    for (const f of arg.formulas) tambah(f.item_id, (f.percentage / 100) * kg);
  }

  return {
    dariTimbangan,
    jatah: [...total].map(([item_id, qty]) => ({ item_id, qty })),
  };
}

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

/** Berapa banyak satu bahan sudah dijatah oleh satu Plan berjalan. */
export type PpicAlokasi = { plan: PpicPlanTerbuka; qty: number };

export type PpicBahan = {
  item: PpicItem;
  /** Kebutuhan rencana PPIC yang sedang disusun. */
  butuh: number;
  /** Jatah Plan Produksi yang belum Input Hasil. */
  alokasi: number;
  /** alokasi + butuh */
  totalButuh: number;
  /** Stok sisa - alokasi. Boleh negatif: Plan berjalan sudah melebihi stok. */
  tersedia: number;
  /**
   * totalButuh - stok SIAP PAKAI. Sengaja tidak dikurangi karantina
   * maupun PO: yang bisa dipotong produksi hari ini cuma qty_sisa.
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
  /** Produk rencana PPIC yang memakai bahan ini, terbesar dulu. Jumlahnya = butuh. */
  untuk: PpicPemakaian[];
  /** Plan berjalan yang menjatah bahan ini, terbesar dulu. Jumlahnya = alokasi. */
  alokasiPlan: PpicAlokasi[];
};

export type PpicHasil = {
  /** Baris rencana yang sah (produknya ada, batch > 0), urutan apa adanya. */
  rencana: PpicBarisRencana[];
  /**
   * Bahan yang dibutuhkan rencana PPIC, ditambah bahan yang SUDAH kurang
   * cuma untuk Plan berjalan. Yang paling butuh tindakan dulu.
   */
  bahan: PpicBahan[];
  /** Bahan yang masih harus dipesan. */
  perluBeli: PpicBahan[];
  /** Bahan yang kurang dan sebagian atau seluruhnya sudah di karantina / PO. */
  dalamProses: PpicBahan[];
  /** Plan berjalan yang ikut menjatah bahan di neraca ini. */
  planTerlibat: PpicPlanTerbuka[];
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

/** Hasil tangga persediaan satu bahan. */
export type PpicNeraca = Pick<
  PpicBahan,
  | "totalButuh"
  | "tersedia"
  | "kurang"
  | "qtyKarantina"
  | "qtyPoDikirim"
  | "qtyPoBelumDikirim"
  | "belumDipesan"
  | "qtyBeli"
  | "status"
  | "tanpaMoq"
>;

/**
 * Neraca SATU bahan: tangga persediaan, status, dan Qty Beli.
 *
 * Dipisah dari hitungPpic supaya PPIC R&D (lib/rndPpic.ts) memakai
 * tangga yang sama persis. Dua salinan tangga berarti dua jawaban
 * "perlu beli berapa" untuk bahan yang sama, tergantung layar mana
 * yang dibuka.
 */
export function neracaBahan(
  item: PpicItem,
  butuh: number,
  alokasi: number
): PpicNeraca {
  const totalButuh = alokasi + butuh;

  const qtyKarantina = item.karantina.reduce((s, k) => s + k.qty, 0);
  const qtyPoDikirim = item.poTerbuka
    .filter((p) => PO_SUDAH_DIKIRIM.includes(p.status))
    .reduce((s, p) => s + p.sisa, 0);
  const qtyPoBelumDikirim = item.poTerbuka
    .filter((p) => PO_BELUM_DIKIRIM.includes(p.status))
    .reduce((s, p) => s + p.sisa, 0);

  // Tangga persediaan, dari yang paling pasti. Statusnya adalah anak
  // tangga pertama yang sudah menutup SELURUH kebutuhan (Plan berjalan
  // + rencana).
  const siap = item.stok;
  const plusQc = siap + qtyKarantina;
  const plusDikirim = plusQc + qtyPoDikirim;
  const plusSemuaPo = plusDikirim + qtyPoBelumDikirim;
  const tertutup = (n: number) => n >= totalButuh - TOLERANSI;
  const status: PpicStatus = tertutup(siap)
    ? "Cukup"
    : tertutup(plusQc)
      ? "Menunggu QC"
      : tertutup(plusDikirim)
        ? "Menunggu Kedatangan"
        : tertutup(plusSemuaPo)
          ? "PO Belum Dikirim"
          : "Perlu Beli";

  const kurang = status === "Cukup" ? 0 : totalButuh - siap;
  const belumDipesan = status === "Perlu Beli" ? totalButuh - plusSemuaPo : 0;

  return {
    totalButuh,
    tersedia: siap - alokasi,
    kurang,
    qtyKarantina,
    qtyPoDikirim,
    qtyPoBelumDikirim,
    belumDipesan,
    qtyBeli: bulatkanMoq(belumDipesan, item.moq),
    status,
    tanpaMoq: belumDipesan > 0 && !adaMoq(item.moq),
  };
}

export function hitungPpic(
  products: PpicProduct[],
  items: PpicItem[],
  rencana: PpicRencana[],
  planTerbuka: PpicPlanTerbuka[] = []
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

  // item_id -> jatah per Plan berjalan
  const alokasiOf = new Map<string, PpicAlokasi[]>();
  for (const plan of planTerbuka) {
    for (const j of plan.jatah) {
      const daftar = alokasiOf.get(j.item_id) || [];
      daftar.push({ plan, qty: j.qty });
      alokasiOf.set(j.item_id, daftar);
    }
  }

  // Yang masuk neraca: dipakai rencana PPIC, ATAU sudah kurang cuma
  // karena Plan berjalan. Bahan kemasan milik Plan berjalan yang stoknya
  // cukup tidak ikut, dia tidak mengubah keputusan belanja apa pun.
  const terlibat = new Set<string>(pakai.keys());
  for (const [itemId, daftar] of alokasiOf) {
    const item = itemMap.get(itemId);
    if (!item) continue;
    const alokasi = daftar.reduce((s, a) => s + a.qty, 0);
    if (alokasi > item.stok + TOLERANSI) terlibat.add(itemId);
  }

  const bahan: PpicBahan[] = [];
  const planDipakai = new Set<string>();
  for (const itemId of terlibat) {
    const item = itemMap.get(itemId);
    if (!item) continue;

    const untuk = [...(pakai.get(itemId) || new Map<string, number>())]
      .map(([pid, qty]) => ({ product: productMap.get(pid)!, qty }))
      .sort((a, b) => b.qty - a.qty);
    const butuh = untuk.reduce((s, u) => s + u.qty, 0);

    const alokasiPlan = [...(alokasiOf.get(itemId) || [])].sort(
      (a, b) => b.qty - a.qty
    );
    const alokasi = alokasiPlan.reduce((s, a) => s + a.qty, 0);
    for (const a of alokasiPlan) planDipakai.add(a.plan.id);
    const n = neracaBahan(item, butuh, alokasi);
    bahan.push({
      item,
      butuh,
      alokasi,
      ...n,
      dana: item.harga != null ? n.qtyBeli * item.harga : null,
      untuk,
      alokasiPlan,
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
    planTerlibat: planTerbuka.filter((p) => planDipakai.has(p.id)),
    totalDana: perluBeli.reduce((s, c) => s + (c.dana || 0), 0),
    adaTanpaHarga: perluBeli.some((c) => c.dana == null),
    tanpaMoq: perluBeli.filter((c) => c.tanpaMoq),
    jumlahStatus,
    tanpaUkuranBatch: [...tanpaUkuran.values()],
    tidakDitemukan,
  };
}

/** Satu dokumen yang sedang dalam proses untuk satu bahan. */
export type PpicDokumenProses = {
  jenis: "Karantina" | "PO";
  /** nomor PO, atau nomor lot supplier untuk karantina */
  nomor: string;
  /** "Karantina QC" atau status PO */
  tahap: string;
  supplier: string | null;
  tanggal: string | null;
  qty: number;
};

/**
 * Lot karantina dan PO terbuka untuk satu bahan, dalam bentuk baris.
 * Satu sumber untuk layar dan kertas, supaya nomor PO yang harus
 * ditagih terbaca sama di keduanya.
 */
export function dokumenProses(item: PpicItem): PpicDokumenProses[] {
  return [
    ...item.karantina.map((k) => ({
      jenis: "Karantina" as const,
      nomor: k.lot ? `Lot ${k.lot}` : "Lot tanpa nomor",
      tahap: "Karantina QC",
      supplier: k.supplier,
      tanggal: k.tanggal,
      qty: k.qty,
    })),
    ...item.poTerbuka.map((p) => ({
      jenis: "PO" as const,
      nomor: p.noPo || "PO tanpa nomor",
      tahap: p.status,
      supplier: p.supplier,
      tanggal: p.tanggal,
      qty: p.sisa,
    })),
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
