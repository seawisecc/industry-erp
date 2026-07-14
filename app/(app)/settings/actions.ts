"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type SettingsInput = {
  alamat: string | null;
  no_telp: string | null;
  email: string | null;
  npwp: string | null;
  sign_dibuat_nama: string | null;
  sign_dibuat_jabatan: string | null;
  sign_disetujui_nama: string | null;
  sign_disetujui_jabatan: string | null;
  sign_mengetahui_nama: string | null;
  sign_mengetahui_jabatan: string | null;
};

export async function saveSettings(data: SettingsInput) {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }
  if (!isSuperAdmin && profile?.role !== "Admin") {
    throw new Error("Hanya Admin yang bisa mengubah pengaturan.");
  }

  const clean = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, (v as string | null)?.trim() || null])
  );

  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: organizationId,
      ...clean,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  return { success: true };
}
