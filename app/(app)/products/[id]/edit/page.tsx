import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ProductForm, { ItemOption } from "../../ProductForm";

type ProductRaw = {
  id: string;
  kode: string | null;
  nama_produk: string;
  brand: string | null;
  kategori: string | null;
  batch_size_kg: number | null;
  aktif: boolean;
  product_formulas: { item_id: string; percentage: number }[];
  product_variants: {
    nama_varian: string;
    netto: number | null;
    satuan_netto: string | null;
    harga_jual: number | null;
    variant_packaging: { item_id: string; qty_per_pcs: number }[];
  }[];
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: items }] = await Promise.all([
    supabase
      .from("products")
      .select(
        `id, kode, nama_produk, brand, kategori, batch_size_kg, aktif,
         product_formulas(item_id, percentage),
         product_variants(nama_varian, netto, satuan_netto, harga_jual, variant_packaging(item_id, qty_per_pcs))`
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase
      .from("items")
      .select("id, kode, nama, satuan, kategori")
      .eq("organization_id", organizationId)
      .eq("aktif", true)
      .order("kode"),
  ]);

  if (!data) notFound();
  const product = data as unknown as ProductRaw;

  return (
    <div className="max-w-3xl">
      <Link
        href="/products"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Produk
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Edit Produk <span className="font-mono text-[20px]">{product.kode}</span>
      </h1>
      <p className="text-muted text-sm mb-6">
        Perubahan formulasi &amp; varian hanya memengaruhi produksi berikutnya.
      </p>

      <ProductForm
        items={(items || []) as ItemOption[]}
        product={{
          id: product.id,
          kode: product.kode,
          nama_produk: product.nama_produk,
          brand: product.brand,
          kategori: product.kategori,
          batch_size_kg:
            product.batch_size_kg == null ? null : Number(product.batch_size_kg),
          aktif: product.aktif,
          formulas: (product.product_formulas || []).map((f) => ({
            item_id: f.item_id,
            percentage: Number(f.percentage),
          })),
          variants: (product.product_variants || []).map((v) => ({
            nama_varian: v.nama_varian,
            netto: v.netto == null ? null : Number(v.netto),
            satuan_netto: v.satuan_netto,
            harga_jual: v.harga_jual == null ? null : Number(v.harga_jual),
            packaging: (v.variant_packaging || []).map((p) => ({
              item_id: p.item_id,
              qty_per_pcs: Number(p.qty_per_pcs),
            })),
          })),
        }}
      />
    </div>
  );
}
