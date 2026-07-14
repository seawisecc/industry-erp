"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type ProductionInput = {
  no_batch: string;
  tanggal: string; // yyyy-mm-dd
  catatan: string | null;
  product_id: string;
  outputs: { varian_ukuran: string; qty_hasil: number; satuan: string }[];
  components: { item_id: string; qty: number }[];
};

export async function createProduction(data: ProductionInput) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }
  if (!data.no_batch?.trim()) throw new Error("No. batch produksi wajib diisi");
  if (!data.tanggal) throw new Error("Tanggal produksi wajib diisi");
  if (!data.product_id) throw new Error("Produk wajib dipilih");

  const outputs = data.outputs.filter((o) => o.qty_hasil > 0);
  if (outputs.length === 0)
    throw new Error("Minimal satu varian dengan qty hasil lebih dari 0");

  // Gabungkan bahan yang sama (misal kemasan dipakai 2 varian) jadi satu baris
  const merged = new Map<string, number>();
  for (const c of data.components) {
    if (!c.item_id || c.qty <= 0) continue;
    merged.set(c.item_id, (merged.get(c.item_id) || 0) + c.qty);
  }
  const components = Array.from(merged, ([item_id, qty]) => ({ item_id, qty }));
  if (components.length === 0)
    throw new Error("Minimal satu bahan dengan qty lebih dari 0");

  // Semua pemotongan stok terjadi atomic di dalam Postgres function (FEFO)
  const { data: batchId, error } = await supabase.rpc("create_production", {
    p_organization_id: organizationId,
    p_no_batch: data.no_batch.trim(),
    p_tanggal: data.tanggal,
    p_catatan: data.catatan,
    p_product_id: data.product_id,
    p_outputs: outputs,
    p_components: components,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/production");
  revalidatePath("/items");
  revalidatePath("/dashboard");
  return { success: true, batchId: batchId as string };
}
