import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Menentukan organization_id mana yang harus dipakai untuk query data.
 * - Kalau bukan Super Admin: selalu pakai organisasi sendiri (gak bisa diganti).
 * - Kalau Super Admin: pakai organisasi yang sedang dipilih (disimpan di cookie),
 *   atau kalau belum pernah pilih, default ke organisasi sendiri.
 */
export async function getEffectiveOrg() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user?.id)
    .single();

  if (!profile) {
    return { profile: null, organizationId: null, isSuperAdmin: false };
  }

  if (!profile.is_super_admin) {
    return { profile, organizationId: profile.organization_id, isSuperAdmin: false };
  }

  const cookieStore = await cookies();
  const selectedOrgId = cookieStore.get("selected_org_id")?.value;

  return {
    profile,
    organizationId: selectedOrgId || profile.organization_id,
    isSuperAdmin: true,
  };
}