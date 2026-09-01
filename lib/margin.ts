/* ============================================================
   Analisa margin: HPP real per batch bertemu harga jual aktual.

   DUA SUMBER, DUA RENTANG WAKTU YANG BERBEDA

   Omzet diambil dari periode yang dipilih user. HPP TIDAK, dia
   dihitung dari SELURUH riwayat produksi. Kalau basis biayanya ikut
   dipotong periode, produk yang terjual bulan ini tapi diproduksi
   bulan lalu akan kehilangan HPP-nya dan marginnya tampak 100%.

   ALOKASI BIAYA BATCH KE VARIAN

   Satu batch bisa menghasilkan beberapa ukuran sekaligus. Membagi
   biayanya rata per pcs membuat botol 100 ml tampak semurah 30 ml,
   dan marginnya jadi bohong ke dua arah sekaligus. Jadi biayanya
   dibagi menurut netto: varian yang menyerap lebih banyak ruahan
   menanggung biaya lebih besar.

   Kalau ada satu saja varian di batch itu yang nettonya belum diisi,
   seluruh batch jatuh ke pembagian rata per pcs, mencampur bobot
   netto dengan bobot 1 akan menghasilkan angka yang jauh lebih ngawur
   daripada sekadar membagi rata.
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import { varianKey } from "@/lib/clientPrice";

/** Ukuran halaman saat menarik seluruh riwayat produksi. */
const HALAMAN = 1000;

export type MarginRow = {
  key: string;
  kode: string | null;
  nama_produk: string;
  /** brand pemilik produk, supaya dua produk bernama mirip bisa dibedakan */
  brand: string | null;
  varian: string;
  qtyTerjual: number;
  omzet: number;
  /** null = produk ini belum pernah diproduksi lewat modul Produksi */
  hppPerPcs: number | null;
  totalHpp: number | null;
  margin: number | null;
  marginPct: number | null;
};

export type MarginReport = {
  rows: MarginRow[];
  totalOmzet: number;
  /** hanya dari baris yang HPP-nya diketahui */
  totalHpp: number;
  totalMargin: number;
  marginPct: number | null;
  /** baris terjual yang HPP-nya tidak diketahui */
  tanpaHpp: number;
  omzetTanpaHpp: number;
};

type OutputRow = {
  production_batch_id: string;
  product_id: string;
  varian_ukuran: string | null;
  qty_hasil: number;
  production_batches: { total_cost_bahan: number; qa_status: string | null } | null;
};

export async function getMarginReport(
  organizationId: string,
  from: string,
  to: string
): Promise<MarginReport> {
  const supabase = await createClient();

  // ---- 1. Seluruh riwayat produksi, dibaca halaman per halaman ----
  //
  // Basis biaya tidak boleh terpotong diam-diam di batas baris PostgREST:
  // HPP yang kurang lengkap membuat margin tampak lebih besar dari
  // sebenarnya, dan tidak ada satu pun tanda bahwa ada yang hilang.
  const outputs: OutputRow[] = [];
  for (let dari = 0; ; dari += HALAMAN) {
    const { data, error } = await supabase
      .from("production_outputs")
      .select(
        "production_batch_id, product_id, varian_ukuran, qty_hasil, production_batches!inner(total_cost_bahan, qa_status)"
      )
      .eq("organization_id", organizationId)
      .order("id")
      .range(dari, dari + HALAMAN - 1);
    // Gagal di tengah TIDAK boleh dilewat diam-diam: basis biaya yang
    // kurang membuat HPP mengecil dan margin tampak jauh lebih sehat dari
    // kenyataan. Lebih baik laporannya gagal terang-terangan.
    if (error) {
      throw new Error(
        `Gagal membaca riwayat produksi untuk perhitungan HPP: ${error.message}`
      );
    }
    const halaman = (data || []) as unknown as OutputRow[];
    outputs.push(...halaman);
    if (halaman.length < HALAMAN) break;
  }

  // ---- 2. Netto per varian, jadi bobot alokasi biaya ----
  const { data: variants } = await supabase
    .from("product_variants")
    .select("product_id, nama_varian, netto")
    .eq("organization_id", organizationId);

  const nettoMap = new Map<string, number>();
  for (const v of (variants || []) as {
    product_id: string;
    nama_varian: string;
    netto: number | null;
  }[]) {
    if (v.netto != null && Number(v.netto) > 0) {
      nettoMap.set(`${v.product_id}|${varianKey(v.nama_varian)}`, Number(v.netto));
    }
  }

  // ---- 3. Kelompokkan output per batch, lalu alokasikan biayanya ----
  //
  // Batch yang DITOLAK QA tidak ikut: hasilnya tidak pernah masuk stok
  // jual, jadi tidak pernah jadi harga pokok barang yang terjual.
  type Alokasi = { totalCost: number; qty: number };
  const perBatch = new Map<
    string,
    { cost: number; items: { key: string; qty: number }[] }
  >();

  for (const o of outputs) {
    const b = o.production_batches;
    if (!b || b.qa_status === "Rejected") continue;
    const qty = Number(o.qty_hasil);
    if (qty <= 0) continue;

    const entry = perBatch.get(o.production_batch_id) || {
      cost: Number(b.total_cost_bahan),
      items: [],
    };
    entry.items.push({
      key: `${o.product_id}|${varianKey(o.varian_ukuran)}`,
      qty,
    });
    perBatch.set(o.production_batch_id, entry);
  }

  const biaya = new Map<string, Alokasi>();
  for (const { cost, items } of perBatch.values()) {
    // Netto lengkap untuk SEMUA varian di batch ini? Kalau tidak, bagi rata.
    const semuaAdaNetto = items.every((i) => nettoMap.has(i.key));
    const bobot = (k: string) => (semuaAdaNetto ? nettoMap.get(k)! : 1);

    const pembagi = items.reduce((s, i) => s + i.qty * bobot(i.key), 0);
    if (pembagi <= 0) continue;

    for (const i of items) {
      const porsi = (cost * (i.qty * bobot(i.key))) / pembagi;
      const cur = biaya.get(i.key) || { totalCost: 0, qty: 0 };
      cur.totalCost += porsi;
      cur.qty += i.qty;
      biaya.set(i.key, cur);
    }
  }

  // ---- 4. Penjualan pada periode terpilih ----
  const { data: penjualan } = await supabase
    .from("sales_invoice_items")
    .select(
      "product_id, varian_ukuran, qty, subtotal, products(kode, nama_produk, brand), sales_invoices!inner(tanggal)"
    )
    .eq("organization_id", organizationId)
    .not("product_id", "is", null)
    .gte("sales_invoices.tanggal", from)
    .lte("sales_invoices.tanggal", to);

  const jual = new Map<
    string,
    {
      qty: number;
      omzet: number;
      kode: string | null;
      nama: string;
      brand: string | null;
      varian: string;
    }
  >();
  for (const s of (penjualan || []) as unknown as {
    product_id: string;
    varian_ukuran: string | null;
    qty: number;
    subtotal: number;
    products: { kode: string | null; nama_produk: string; brand: string | null } | null;
  }[]) {
    const vk = varianKey(s.varian_ukuran);
    const key = `${s.product_id}|${vk}`;
    const cur = jual.get(key) || {
      qty: 0,
      omzet: 0,
      kode: s.products?.kode ?? null,
      nama: s.products?.nama_produk || "(produk dihapus)",
      brand: s.products?.brand ?? null,
      varian: vk,
    };
    cur.qty += Number(s.qty);
    cur.omzet += Number(s.subtotal);
    jual.set(key, cur);
  }

  // ---- 5. Gabungkan ----
  const rows: MarginRow[] = [];
  for (const [key, s] of jual) {
    const b = biaya.get(key);
    const hpp = b && b.qty > 0 ? b.totalCost / b.qty : null;
    const totalHpp = hpp != null ? hpp * s.qty : null;
    const margin = totalHpp != null ? s.omzet - totalHpp : null;
    rows.push({
      key,
      kode: s.kode,
      nama_produk: s.nama,
      brand: s.brand,
      varian: s.varian,
      qtyTerjual: s.qty,
      omzet: s.omzet,
      hppPerPcs: hpp,
      totalHpp,
      margin,
      marginPct: margin != null && s.omzet > 0 ? (margin / s.omzet) * 100 : null,
    });
  }
  rows.sort((a, b) => b.omzet - a.omzet);

  const totalOmzet = rows.reduce((s, r) => s + r.omzet, 0);
  const berHpp = rows.filter((r) => r.totalHpp != null);
  const totalHpp = berHpp.reduce((s, r) => s + (r.totalHpp as number), 0);
  const omzetBerHpp = berHpp.reduce((s, r) => s + r.omzet, 0);
  const totalMargin = omzetBerHpp - totalHpp;
  const tanpa = rows.filter((r) => r.totalHpp == null);

  return {
    rows,
    totalOmzet,
    totalHpp,
    totalMargin,
    marginPct: omzetBerHpp > 0 ? (totalMargin / omzetBerHpp) * 100 : null,
    tanpaHpp: tanpa.length,
    omzetTanpaHpp: tanpa.reduce((s, r) => s + r.omzet, 0),
  };
}
