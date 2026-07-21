"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type UserInput = {
  nama: string;
  role_title: string; // jabatan bebas sesuai struktur company
  is_admin: boolean; // akses penuh + kelola pengguna
  allowed_modules: string[] | null; // null = akses semua
  aktif: boolean;
  can_approve_po: boolean;
  can_plan_production: boolean;
  can_qc: boolean; // boleh mengisi & memutuskan hasil uji QC
  can_qa: boolean; // boleh meninjau & meluluskan batch (QA)
};

async function requireAdmin() {
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }
  if (!isSuperAdmin && profile?.role !== "Admin") {
    throw new Error("Hanya Admin yang bisa mengelola pengguna.");
  }
  return { organizationId, isSuperAdmin };
}

function normalizeModules(data: UserInput): string[] | null {
  // Admin selalu akses semua
  if (data.is_admin) return null;
  if (!data.allowed_modules || data.allowed_modules.length === 0) {
    throw new Error("Pilih minimal satu modul yang boleh diakses");
  }
  return data.allowed_modules;
}

export async function createUser(
  data: UserInput & { email: string; password: string }
) {
  const { organizationId } = await requireAdmin();

  if (!data.email?.trim()) throw new Error("Email wajib diisi");
  if (!data.password || data.password.length < 6)
    throw new Error("Password minimal 6 karakter");
  if (!data.nama?.trim()) throw new Error("Nama wajib diisi");

  const modules = normalizeModules(data);
  const admin = createAdminClient();

  const { data: created, error } = await admin.auth.admin.createUser({
    email: data.email.trim().toLowerCase(),
    password: data.password,
    email_confirm: true,
    user_metadata: {
      nama: data.nama.trim(),
      role: data.is_admin ? "Admin" : "Staff Gudang",
      organization_id: organizationId,
      allowed_modules: modules,
    },
  });

  if (error) throw new Error(error.message);

  // Pastikan profile konsisten (trigger sudah membuatnya, ini penegasan)
  const { error: pError } = await admin
    .from("profiles")
    .update({
      nama: data.nama.trim(),
      role: data.is_admin ? "Admin" : "Staff Gudang",
      role_title: data.role_title?.trim() || null,
      aktif: true,
      organization_id: organizationId,
      allowed_modules: modules,
      can_approve_po: data.can_approve_po,
      can_plan_production: data.can_plan_production,
      can_qc: data.can_qc,
      can_qa: data.can_qa,
    })
    .eq("id", created.user.id);

  if (pError) throw new Error(pError.message);

  revalidatePath("/users");
  return { success: true };
}

export async function updateUser(
  id: string,
  data: UserInput & { new_password?: string }
) {
  const { organizationId, isSuperAdmin } = await requireAdmin();

  if (!data.nama?.trim()) throw new Error("Nama wajib diisi");
  const modules = normalizeModules(data);

  const admin = createAdminClient();

  // Pastikan target user milik organisasi yang sama (kecuali Super Admin)
  const { data: target } = await admin
    .from("profiles")
    .select("id, organization_id, is_super_admin")
    .eq("id", id)
    .single();

  if (!target) throw new Error("Pengguna tidak ditemukan");
  if (!isSuperAdmin && target.organization_id !== organizationId) {
    throw new Error("Pengguna ini bukan bagian dari perusahaanmu");
  }
  if (target.is_super_admin && !isSuperAdmin) {
    throw new Error("Tidak bisa mengubah akun Super Admin");
  }

  const { error } = await admin
    .from("profiles")
    .update({
      nama: data.nama.trim(),
      role: data.is_admin ? "Admin" : "Staff Gudang",
      role_title: data.role_title?.trim() || null,
      aktif: data.aktif,
      allowed_modules: modules,
      can_approve_po: data.can_approve_po,
      can_plan_production: data.can_plan_production,
      can_qc: data.can_qc,
      can_qa: data.can_qa,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  if (data.new_password) {
    if (data.new_password.length < 6)
      throw new Error("Password baru minimal 6 karakter");
    const { error: pwError } = await admin.auth.admin.updateUserById(id, {
      password: data.new_password,
    });
    if (pwError) throw new Error(pwError.message);
  }

  revalidatePath("/users");
  return { success: true };
}
