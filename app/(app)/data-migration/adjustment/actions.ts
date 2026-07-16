"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type AdjustmentItemInput = {
  item_id: string;
  qty_aktual: number;
  harga: number | null;
};

export type AdjustmentInput = {
  tanggal: string; // yyyy-mm-dd
  catatan: string | null;
  items: AdjustmentItemInput[];
};

export async function createStockAdjustment(
  data: AdjustmentInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();

    if (!organizationId) {
      throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
    }
    if (!data.tanggal) throw new Error("Tanggal wajib diisi");

    const items = data.items.filter((it) => it.item_id && it.qty_aktual >= 0);
    if (items.length === 0)
      throw new Error("Tidak ada item yang berubah — sesuaikan minimal satu item.");

    const { error } = await supabase.rpc("create_stock_adjustment", {
      p_organization_id: organizationId,
      p_tanggal: data.tanggal,
      p_catatan: data.catatan,
      p_items: items,
    });

    if (error) throw new Error(error.message);

    revalidatePath("/data-migration/adjustment");
    revalidatePath("/items");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal menyimpan adjustment",
    };
  }
}
