"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export async function setSalesInvoicePaid(
  id: string,
  paid: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { error } = await supabase
      .from("sales_invoices")
      .update({
        status_bayar: paid ? "Lunas" : "Belum Lunas",
        tanggal_bayar: paid ? new Date().toLocaleDateString("sv-SE") : null,
      })
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    revalidatePath("/sales-payments");
    revalidatePath("/sales-invoices");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
