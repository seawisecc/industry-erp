import { createClient } from "@/lib/supabase/server";
import {
  PO_BELUM_DIKIRIM,
  PO_SUDAH_DIKIRIM,
  type PoTerbukaStatus,
  type PpicItem,
  type PpicKarantina,
  type PpicPoTerbuka,
  type PpicProduct,
} from "@/lib/ppic";

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

type KarantinaRaw = {
  item_id: string;
  qty_karantina: number;
  no_lot_supplier: string | null;
  tanggal_terima: string | null;
  supplier_nama: string | null;
};

type PoRaw = {
  no_po: string | null;
  tanggal_po: string;
  status: PoTerbukaStatus;
  suppliers: { nama: string } | null;
  po_items: { item_id: string; qty_pesan: number; qty_diterima: number }[];
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

  const [products, items, links, batches, karantina, pos] = await Promise.all([
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
    // Lot yang menunggu keputusan QC. Lot yang ditolak QC qty_karantina-nya
    // sudah nol (decideQc), jadi otomatis tidak terhitung di sini.
    semua<KarantinaRaw>((a, b) =>
      supabase
        .from("purchase_batches")
        .select("item_id, qty_karantina, no_lot_supplier, tanggal_terima, supplier_nama")
        .eq("organization_id", organizationId)
        .eq("qc_status", "Karantina")
        .gt("qty_karantina", 0)
        .order("tanggal_terima")
        .order("id")
        .range(a, b)
    ),
    // PO yang barangnya belum datang semua. Barang yang sudah diterima
    // (termasuk yang masih karantina) sudah masuk qty_diterima, jadi
    // sisa PO dan karantina tidak pernah terhitung dua kali.
    semua<PoRaw>((a, b) =>
      supabase
        .from("purchase_orders")
        .select(
          "id, no_po, tanggal_po, status, suppliers(nama), po_items(item_id, qty_pesan, qty_diterima)"
        )
        .eq("organization_id", organizationId)
        .in("status", [...PO_BELUM_DIKIRIM, ...PO_SUDAH_DIKIRIM])
        .order("tanggal_po")
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

  const karantinaOf = new Map<string, PpicKarantina[]>();
  for (const k of karantina) {
    const daftar = karantinaOf.get(k.item_id) || [];
    daftar.push({
      qty: Number(k.qty_karantina),
      lot: k.no_lot_supplier,
      tanggal: k.tanggal_terima,
      supplier: k.supplier_nama,
    });
    karantinaOf.set(k.item_id, daftar);
  }

  const poOf = new Map<string, PpicPoTerbuka[]>();
  for (const po of pos) {
    for (const it of po.po_items) {
      const sisa = Number(it.qty_pesan) - Number(it.qty_diterima);
      if (!(sisa > 0)) continue;
      const daftar = poOf.get(it.item_id) || [];
      daftar.push({
        noPo: po.no_po,
        tanggal: po.tanggal_po,
        status: po.status,
        supplier: po.suppliers?.nama || null,
        sisa,
      });
      poOf.set(it.item_id, daftar);
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
    karantina: karantinaOf.get(it.id) || [],
    poTerbuka: poOf.get(it.id) || [],
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
