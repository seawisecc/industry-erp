"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

// Nyalakan/matikan fitur berbayar (mis. MES) untuk satu company, Super Admin saja
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

/* ============================================================
   Hitung ulang pemakaian penyimpanan seluruh organisasi.

   Satu action dipakai dua layar: Companies (super admin, melihat
   semua) dan Settings (client, melihat miliknya sendiri). Hitungannya
   memang menghasilkan angka untuk SEMUA organisasi sekaligus,
   biaya terbesarnya memindai tabelnya, dan satu pemindaian sudah
   cukup untuk semuanya.

   Karena itu client boleh memicunya juga: yang dia bayar sama saja
   dengan yang dibayar super admin, dan fungsi SQL-nya punya rem
   10 menit supaya tidak bisa dipakai menggempur database.
   `paksa` hanya untuk super admin, dialah yang butuh angka detik
   ini juga saat sedang menagih.
   ============================================================ */
export async function hitungUlangStorage(
  paksa = false
): Promise<{ ok: boolean; error?: string; dihitungPada?: string }> {
  try {
    const { isSuperAdmin, organizationId } = await getEffectiveOrg();
    if (!organizationId && !isSuperAdmin)
      throw new Error("Organisasi tidak terdeteksi");

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("refresh_org_storage", {
      p_paksa: paksa && isSuperAdmin,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/companies");
    revalidatePath("/settings");
    return { ok: true, dihitungPada: data as string };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal menghitung",
    };
  }
}
