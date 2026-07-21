"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import type { FeatureFlags } from "@/lib/features";

export async function saveFeatures(
  flags: FeatureFlags
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!isSuperAdmin && profile?.role !== "Admin")
      throw new Error("Hanya Admin yang bisa mengubah fitur");

    // MES dikendalikan Super Admin (paket berbayar) — Admin biasa tidak
    // bisa mengubahnya; nilai lama dipertahankan.
    const { data: existing } = await supabase
      .from("organization_settings")
      .select("features")
      .eq("organization_id", organizationId)
      .maybeSingle();
    const cur = (existing?.features as Record<string, boolean> | null) || {};
    const currentMes = cur.mes === true;
    const currentQc = cur.qc === true;
    const currentQa = cur.qa === true;

    const { error } = await supabase.from("organization_settings").upsert(
      {
        organization_id: organizationId,
        features: {
          mes: isSuperAdmin ? !!flags.mes : currentMes,
          qc: isSuperAdmin ? !!flags.qc : currentQc,
          qa: isSuperAdmin ? !!flags.qa : currentQa,
        },
      },
      { onConflict: "organization_id" }
    );
    if (error) throw new Error(error.message);

    revalidatePath("/features");
    revalidatePath("/production");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal menyimpan" };
  }
}
