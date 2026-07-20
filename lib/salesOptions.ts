import { createClient } from "@/lib/supabase/server";
import { getFinishedStock } from "@/lib/salesStock";

export type ClientOpt = { id: string; kode: string | null; company_brand: string };

export type ProductVariantOpt = {
  key: string;
  product_id: string; // "" untuk jasa
  varian: string;
  label: string;
  available: number;
  harga_jual: number | null;
  service_id: string | null; // terisi bila baris ini layanan jasa
};

/**
 * Opsi client aktif + produk-varian dengan stok tersedia — dipakai Invoice,
 * POS, Konsinyasi. includeServices: sertakan layanan jasa (Invoice & POS saja —
 * jasa tidak bisa dikonsinyasikan).
 */
export async function getSalesOptions(
  organizationId: string,
  { includeServices = false }: { includeServices?: boolean } = {}
) {
  const supabase = await createClient();

  const [{ data: clients }, { data: products }, { data: variants }, stock] =
    await Promise.all([
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
      supabase
        .from("product_variants")
        .select("product_id, nama_varian, harga_jual")
        .eq("organization_id", organizationId),
      getFinishedStock(organizationId),
    ]);

  // Harga jual per (produk|varian) dari master produk
  const hargaMap = new Map<string, number>();
  for (const v of (variants || []) as {
    product_id: string;
    nama_varian: string;
    harga_jual: number | null;
  }[]) {
    if (v.harga_jual != null) {
      hargaMap.set(`${v.product_id}|${v.nama_varian}`, Number(v.harga_jual));
    }
  }

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
      harga_jual: hargaMap.get(`${s.product_id}|${s.varian}`) ?? null,
      service_id: null,
    });
  }
  options.sort((a, b) => a.label.localeCompare(b.label));

  // Layanan jasa (tanpa stok) — tampil setelah produk
  if (includeServices) {
    const { data: services } = await supabase
      .from("services")
      .select("id, kode, nama_jasa, biaya")
      .eq("organization_id", organizationId)
      .eq("aktif", true)
      .order("kode");
    for (const s of (services || []) as {
      id: string;
      kode: string | null;
      nama_jasa: string;
      biaya: number;
    }[]) {
      options.push({
        key: `svc|${s.id}`,
        product_id: "",
        varian: "-",
        label: `${s.kode || "JASA"} — ${s.nama_jasa} (Jasa)`,
        available: 0,
        harga_jual: s.biaya == null ? null : Number(s.biaya),
        service_id: s.id,
      });
    }
  }

  return { clients: (clients || []) as ClientOpt[], options };
}
