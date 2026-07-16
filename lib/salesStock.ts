import { createClient } from "@/lib/supabase/server";

export type FgKey = string; // `${product_id}|${varian}`

export type FgStock = {
  product_id: string;
  varian: string;
  produced: number;
  consigned: number; // terkirim konsinyasi (belum retur)
  sold: number; // terjual langsung (Direct/POS)
  available: number;
};

export function fgKey(productId: string, varian: string | null): FgKey {
  return `${productId}|${varian || "-"}`;
}

/**
 * Hitung stok produk jadi per produk+varian:
 * available = produced − (kirim konsinyasi − retur) − terjual Direct/POS.
 * Penjualan dari konsinyasi TIDAK mengurangi lagi (barang sudah keluar saat kirim).
 */
export async function getFinishedStock(
  organizationId: string
): Promise<Map<FgKey, FgStock>> {
  const supabase = await createClient();

  const [outputsRes, consRes, salesRes] = await Promise.all([
    supabase
      .from("production_outputs")
      .select("product_id, varian_ukuran, qty_hasil")
      .eq("organization_id", organizationId),
    supabase
      .from("consignment_items")
      .select("product_id, varian_ukuran, qty_kirim, qty_retur")
      .eq("organization_id", organizationId),
    supabase
      .from("sales_invoice_items")
      .select("product_id, varian_ukuran, qty, sales_invoices!inner(sumber)")
      .eq("organization_id", organizationId)
      .in("sales_invoices.sumber", ["Direct", "POS"]),
  ]);

  const map = new Map<FgKey, FgStock>();
  const ensure = (productId: string, varian: string | null) => {
    const key = fgKey(productId, varian);
    if (!map.has(key)) {
      map.set(key, {
        product_id: productId,
        varian: varian || "-",
        produced: 0,
        consigned: 0,
        sold: 0,
        available: 0,
      });
    }
    return map.get(key)!;
  };

  for (const o of (outputsRes.data || []) as {
    product_id: string;
    varian_ukuran: string | null;
    qty_hasil: number;
  }[]) {
    ensure(o.product_id, o.varian_ukuran).produced += Number(o.qty_hasil);
  }
  for (const c of (consRes.data || []) as {
    product_id: string;
    varian_ukuran: string | null;
    qty_kirim: number;
    qty_retur: number;
  }[]) {
    ensure(c.product_id, c.varian_ukuran).consigned +=
      Number(c.qty_kirim) - Number(c.qty_retur);
  }
  for (const s of (salesRes.data || []) as unknown as {
    product_id: string;
    varian_ukuran: string | null;
    qty: number;
  }[]) {
    ensure(s.product_id, s.varian_ukuran).sold += Number(s.qty);
  }

  for (const v of map.values()) {
    v.available = v.produced - v.consigned - v.sold;
  }
  return map;
}
