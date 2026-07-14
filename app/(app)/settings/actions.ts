"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export async function updateAccount(data: {
  company_nama: string;
  admin_nama: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

    if (!organizationId || !profile) {
      throw new Error("Sesi tidak terdeteksi. Refresh halaman dan login ulang.");
    }
    if (!isSuperAdmin && profile.role !== "Admin") {
      throw new Error("Hanya Admin yang bisa mengubah data ini.");
    }
    if (!data.company_nama?.trim()) throw new Error("Nama perusahaan wajib diisi");
    if (!data.admin_nama?.trim()) throw new Error("Nama wajib diisi");

    const admin = createAdminClient();

    const { error: orgError } = await admin
      .from("organizations")
      .update({ nama: data.company_nama.trim() })
      .eq("id", organizationId);
    if (orgError) throw new Error(orgError.message);

    const { error: pError } = await admin
      .from("profiles")
      .update({ nama: data.admin_nama.trim() })
      .eq("id", profile.id);
    if (pError) throw new Error(pError.message);

    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal menyimpan",
    };
  }
}

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
