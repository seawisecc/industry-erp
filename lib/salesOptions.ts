import { createClient } from "@/lib/supabase/server";
import { getFinishedStock } from "@/lib/salesStock";

export type ClientOpt = { id: string; kode: string | null; company_brand: string };

export type ProductVariantOpt = {
  key: string;
  product_id: string;
  varian: string;
  label: string;
  available: number;
};

/** Opsi client aktif + produk-varian dengan stok tersedia — dipakai Invoice, POS, Konsinyasi. */
export async function getSalesOptions(organizationId: string) {
  const supabase = await createClient();

  const [{ data: clients }, { data: products }, stock] = await Promise.all([
    supabase
      .from("clients")
      .select("id, kode, company_brand")
      .eq("organization_id", organizationId)
      .eq("aktif", true)
      .order("company_brand"),
    supabase
      .from("products")
      .select("id, kode, nama_produk")
      .eq("organization_id", organizationId)
      .order("kode"),
    getFinishedStock(organizationId),
  ]);

  const productMap = new Map(
    ((products || []) as { id: string; kode: string | null; nama_produk: string }[]).map(
      (p) => [p.id, p]
    )
  );

  const options: ProductVariantOpt[] = [];
  for (const s of stock.values()) {
    const p = productMap.get(s.product_id);
    if (!p) continue;
    options.push({
      key: `${s.product_id}|${s.varian}`,
      product_id: s.product_id,
      varian: s.varian,
      label: `${p.kode || ""} — ${p.nama_produk}${s.varian !== "-" ? ` (${s.varian})` : ""}`,
      available: s.available,
    });
  }
  options.sort((a, b) => a.label.localeCompare(b.label));

  return { clients: (clients || []) as ClientOpt[], options };
}
