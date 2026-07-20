import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import PembelianShell from "@/components/PembelianShell";
import PpicPlanner, {
  PpicProduct,
  PpicItem,
} from "./PpicPlanner";

type ProductRaw = {
  id: string;
  kode: string | null;
  nama_produk: string;
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

export default async function PpicPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: products }, { data: items }, { data: links }, { data: batches }] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id, kode, nama_produk, batch_size_kg, product_formulas(item_id, percentage)"
        )
        .eq("organization_id", organizationId)
        .eq("aktif", true)
        .order("kode"),
      supabase
        .from("items")
        .select("id, kode, nama, satuan, moq")
        .eq("organization_id", organizationId),
      supabase
        .from("materials")
        .select("item_id, suppliers(nama)")
        .eq("organization_id", organizationId)
        .not("item_id", "is", null),
      supabase
        .from("purchase_batches")
        .select("item_id, qty_sisa, harga_per_unit, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
    ]);

  // Stok sisa + harga terakhir per item
  const stok = new Map<string, number>();
  const lastHarga = new Map<string, number>();
  for (const b of (batches || []) as unknown as BatchRaw[]) {
    stok.set(b.item_id, (stok.get(b.item_id) || 0) + Number(b.qty_sisa));
    if (!lastHarga.has(b.item_id)) lastHarga.set(b.item_id, Number(b.harga_per_unit));
  }

  // Supplier per item (dari material yang ter-link)
  const supplierOf = new Map<string, string>();
  for (const l of (links || []) as unknown as LinkRaw[]) {
    if (l.suppliers?.nama && !supplierOf.has(l.item_id)) {
      supplierOf.set(l.item_id, l.suppliers.nama);
    }
  }

  const ppicItems: PpicItem[] = ((items || []) as ItemRaw[]).map((it) => ({
    id: it.id,
    kode: it.kode,
    nama: it.nama,
    satuan: it.satuan,
    moq: it.moq == null ? null : Number(it.moq),
    stok: stok.get(it.id) || 0,
    harga: lastHarga.get(it.id) ?? null,
    supplier: supplierOf.get(it.id) || null,
  }));

  const ppicProducts: PpicProduct[] = ((products || []) as unknown as ProductRaw[])
    .filter((p) => p.product_formulas.length > 0)
    .map((p) => ({
      id: p.id,
      kode: p.kode,
      nama: p.nama_produk,
      batchKg: p.batch_size_kg == null ? 0 : Number(p.batch_size_kg),
      formulas: p.product_formulas.map((f) => ({
        item_id: f.item_id,
        percentage: Number(f.percentage),
      })),
    }));

  return (
    <PembelianShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          PPIC Planner
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Susun rencana produksi — sistem menghitung kebutuhan bahan dari formula,
          membandingkan dengan stok, lalu merekomendasikan pembelian (MOQ,
          supplier, estimasi dana).
        </p>
      </div>

      <div className="mt-4">
        <PpicPlanner products={ppicProducts} items={ppicItems} />
      </div>
    </PembelianShell>
  );
}
