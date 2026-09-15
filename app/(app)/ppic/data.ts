import { createClient } from "@/lib/supabase/server";
import type { PpicItem, PpicProduct } from "@/lib/ppic";

/* ============================================================
   Data PPIC Planner, dipakai layar /ppic dan dokumen /print/ppic.

   Satu pembaca untuk dua tempat, alasan yang sama dengan lib/ppic.ts:
   kertas yang dibawa ke meja pembelian tidak boleh membaca stok atau
   harga dengan cara yang berbeda dari layar tempat rencananya disusun.

   Diambil per 1000 baris sampai habis. PostgREST memotong hasil di
   max-rows tanpa error apa pun, dan stok yang terpotong tetap terlihat
   masuk akal, cuma kekurangannya jadi lebih besar dari kenyataan.
   ============================================================ */

type ProductRaw = {
  id: string;
  kode: string | null;
  nama_produk: string;
  brand: string | null;
  kategori: string | null;
  batch_size_kg: number | null;
  product_formulas: { item_id: string; percentage: number }[];
};

type ItemRaw = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  moq: number | null;
};

type LinkRaw = {
  item_id: string;
  suppliers: { nama: string } | null;
};

type BatchRaw = {
  item_id: string;
  qty_sisa: number;
  harga_per_unit: number;
};

const HALAMAN = 1000;

type Halaman = PromiseLike<{ data: unknown[] | null; error: unknown }>;

export type PpicData = {
  products: PpicProduct[];
  items: PpicItem[];
  /** Ada query yang gagal. Layar dan kertas wajib mengatakannya. */
  gagal: boolean;
};

export async function getPpicData(organizationId: string): Promise<PpicData> {
  const supabase = await createClient();
  let gagal = false;

  async function semua<T>(ambil: (dari: number, sampai: number) => Halaman) {
    const hasil: T[] = [];
    for (let dari = 0; ; dari += HALAMAN) {
      const { data, error } = await ambil(dari, dari + HALAMAN - 1);
      if (error) {
        gagal = true;
        break;
      }
      const batch = (data || []) as T[];
      hasil.push(...batch);
      if (batch.length < HALAMAN) break;
    }
    return hasil;
  }

  const [products, items, links, batches] = await Promise.all([
    semua<ProductRaw>((a, b) =>
      supabase
        .from("products")
        .select(
          "id, kode, nama_produk, brand, kategori, batch_size_kg, product_formulas(item_id, percentage)"
        )
        .eq("organization_id", organizationId)
        .eq("aktif", true)
        .order("kode")
        .order("id")
        .range(a, b)
    ),
    // Tidak disaring aktif = true: bahan yang dinonaktifkan sesudah
    // formulanya dibuat akan terbaca stok nol dan memunculkan "kurang"
    // untuk barang yang ada. Aturan yang sama dengan layar produksi.
    semua<ItemRaw>((a, b) =>
      supabase
        .from("items")
        .select("id, kode, nama, satuan, moq")
        .eq("organization_id", organizationId)
        .order("id")
        .range(a, b)
    ),
    semua<LinkRaw>((a, b) =>
      supabase
        .from("materials")
        .select("item_id, suppliers(nama)")
        .eq("organization_id", organizationId)
        .not("item_id", "is", null)
        .order("id")
        .range(a, b)
    ),
    // Terbaru dulu: baris pertama per item adalah harga pembelian terakhir.
    semua<BatchRaw>((a, b) =>
      supabase
        .from("purchase_batches")
        .select("item_id, qty_sisa, harga_per_unit, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(a, b)
    ),
  ]);

  // Stok sisa + harga terakhir per item
  const stok = new Map<string, number>();
  const lastHarga = new Map<string, number>();
  for (const b of batches) {
    stok.set(b.item_id, (stok.get(b.item_id) || 0) + Number(b.qty_sisa));
    if (!lastHarga.has(b.item_id)) {
      lastHarga.set(b.item_id, Number(b.harga_per_unit));
    }
  }

  // Supplier per item (dari material yang ter-link)
  const supplierOf = new Map<string, string>();
  for (const l of links) {
    if (l.suppliers?.nama && !supplierOf.has(l.item_id)) {
      supplierOf.set(l.item_id, l.suppliers.nama);
    }
  }

  const ppicItems: PpicItem[] = items.map((it) => ({
    id: it.id,
    kode: it.kode,
    nama: it.nama,
    satuan: it.satuan,
    moq: it.moq == null ? null : Number(it.moq),
    stok: stok.get(it.id) || 0,
    harga: lastHarga.get(it.id) ?? null,
    supplier: supplierOf.get(it.id) || null,
  }));

  const ppicProducts: PpicProduct[] = products
    .filter((p) => p.product_formulas.length > 0)
    .map((p) => ({
      id: p.id,
      kode: p.kode,
      nama: p.nama_produk,
      brand: p.brand?.trim() || null,
      kategori: p.kategori?.trim() || null,
      batchKg: p.batch_size_kg == null ? 0 : Number(p.batch_size_kg),
      formulas: p.product_formulas.map((f) => ({
        item_id: f.item_id,
        percentage: Number(f.percentage),
      })),
    }))
    // Saran di pemilih diurutkan per brand dulu, karena orang mengingat
    // brand lebih dulu daripada kode. Produk tanpa brand di paling bawah.
    .sort(
      (a, b) =>
        (a.brand ?? "￿").localeCompare(b.brand ?? "￿", "id") ||
        (a.kode || "").localeCompare(b.kode || "", "id")
    );

  return { products: ppicProducts, items: ppicItems, gagal };
}
