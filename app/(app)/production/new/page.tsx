import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ProductionForm, { ProductOption, ItemOption } from "../ProductionForm";

type ProductRaw = {
  id: string;
  kode: string | null;
  nama_produk: string;
  brand: string | null;
  batch_size_kg: number | null;
  product_formulas: { item_id: string; percentage: number }[];
  product_variants: {
    id: string;
    nama_varian: string;
    netto: number | null;
    satuan_netto: string | null;
    aktif: boolean;
    variant_packaging: { item_id: string; qty_per_pcs: number }[];
  }[];
};

type ItemRaw = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  purchase_batches: { qty_sisa: number }[];
};

export default async function NewProductionPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: products }, { data: items }] = await Promise.all([
    supabase
      .from("products")
      .select(
        `id, kode, nama_produk, brand, batch_size_kg,
         product_formulas(item_id, percentage),
         product_variants(id, nama_varian, netto, satuan_netto, aktif, variant_packaging(item_id, qty_per_pcs))`
      )
      .eq("organization_id", organizationId)
      .eq("aktif", true)
      .order("kode"),
    supabase
      .from("items")
      .select("id, kode, nama, satuan, purchase_batches(qty_sisa)")
      .eq("organization_id", organizationId)
      .eq("aktif", true)
      .order("kode"),
  ]);

  const productOptions: ProductOption[] = (
    (products || []) as unknown as ProductRaw[]
  ).map((p) => ({
    id: p.id,
    kode: p.kode,
    nama_produk: p.nama_produk,
    brand: p.brand,
    batch_size_kg: p.batch_size_kg == null ? null : Number(p.batch_size_kg),
    formulas: (p.product_formulas || []).map((f) => ({
      item_id: f.item_id,
      percentage: Number(f.percentage),
    })),
    variants: (p.product_variants || [])
      .filter((v) => v.aktif)
      .map((v) => ({
        id: v.id,
        nama_varian: v.nama_varian,
        netto: v.netto == null ? null : Number(v.netto),
        satuan_netto: v.satuan_netto,
        packaging: (v.variant_packaging || []).map((pk) => ({
          item_id: pk.item_id,
          qty_per_pcs: Number(pk.qty_per_pcs),
        })),
      })),
  }));

  const itemOptions: ItemOption[] = ((items || []) as unknown as ItemRaw[]).map(
    (it) => ({
      id: it.id,
      kode: it.kode,
      nama: it.nama,
      satuan: it.satuan,
      stok: (it.purchase_batches || []).reduce((s, b) => s + Number(b.qty_sisa), 0),
    })
  );

  return (
    <div className="max-w-3xl">
      <Link
        href="/production"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Produksi
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Produksi Baru
      </h1>
      <p className="text-muted text-sm mb-6">
        Bahan baku dihitung dari formula % × kg bulk; kemasan dari varian yang
        dipilih. Stok terpotong FEFO saat disimpan.
      </p>

      <ProductionForm products={productOptions} items={itemOptions} />
    </div>
  );
}
