"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

// Nyalakan/matikan fitur berbayar (mis. MES) untuk satu company — Super Admin saja
export async function setCompanyFeature(
  organizationId: string,
  featureKey: "mes" | "qc" | "qa",
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { isSuperAdmin } = await getEffectiveOrg();
    if (!isSuperAdmin)
      throw new Error("Hanya Super Admin yang bisa mengelola fitur company.");

    const admin = createAdminClient();

    // Baca features yang ada, ubah satu key, simpan kembali
    const { data: row } = await admin
      .from("organization_settings")
      .select("features")
      .eq("organization_id", organizationId)
      .maybeSingle();

    const features = {
      ...((row?.features as Record<string, boolean>) || {}),
      [featureKey]: enabled,
    };

    const { error } = await admin
      .from("organization_settings")
      .upsert({ organization_id: organizationId, features }, {
        onConflict: "organization_id",
      });
    if (error) throw new Error(error.message);

    revalidatePath("/companies");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal mengubah fitur",
    };
  }
}

export async function setCompanyActive(
  id: string,
  aktif: boolean,
  aktifSampai: string | null // yyyy-mm-dd, null = tanpa batas
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { isSuperAdmin } = await getEffectiveOrg();
    if (!isSuperAdmin)
      throw new Error("Hanya Super Admin yang bisa mengelola company.");

    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({
        aktif,
        aktif_sampai: aktif ? aktifSampai : null,
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    revalidatePath("/companies");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal mengubah status",
    };
  }
}
