"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { toResult, type ActionResult } from "@/lib/actionResult";
import { type TaxMode } from "@/lib/invoiceMath";
import { validasiLogo } from "@/lib/logo";

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
  /** Logo perusahaan sebagai data URI. Null = tanpa logo. */
  logo: string | null;
  alamat: string | null;
  no_telp: string | null;
  email: string | null;
  npwp: string | null;
  bank_info: string | null;
  sign_dibuat_nama: string | null;
  sign_dibuat_jabatan: string | null;
  sign_disetujui_nama: string | null;
  sign_disetujui_jabatan: string | null;
  sign_mengetahui_nama: string | null;
  sign_mengetahui_jabatan: string | null;
  /**
   * Model perhitungan PPN. Exclude = harga produk belum termasuk pajak,
   * Include = harga produk sudah final. Lihat lib/invoiceMath.ts.
   */
  tax_mode: TaxMode;
  /** Tarif PPN menurut regulasi (12), bukan tarif efektif (11). */
  tax_percent: number;
  /** DPP dihitung 11/12 dari harga jual (PMK 131/2024). */
  tax_dpp_nilai_lain: boolean;
};

export async function saveSettings(
  data: SettingsInput
): Promise<ActionResult> {
  return toResult(() => saveSettingsImpl(data), "Gagal menyimpan pengaturan");
}

async function saveSettingsImpl(data: SettingsInput) {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }
  if (!isSuperAdmin && profile?.role !== "Admin") {
    throw new Error("Hanya Admin yang bisa mengubah pengaturan.");
  }

  // tax_mode & tax_percent bukan teks, jadi dipisahkan sebelum kolom
  // lainnya di-trim jadi null.
  const { tax_mode, tax_percent, tax_dpp_nilai_lain, logo, ...teks } = data;

  // Logonya dikecilkan di layar sebelum dikirim, tapi yang menentukan
  // tetap penjaga di sini: server action bisa dipanggil dari mana saja.
  const logoBersih = logo?.trim() || null;
  if (logoBersih) {
    const salah = validasiLogo(logoBersih);
    if (salah) throw new Error(salah);
  }

  const clean = Object.fromEntries(
    Object.entries(teks).map(([k, v]) => [k, (v as string | null)?.trim() || null])
  );

  const mode: TaxMode = tax_mode === "Include" ? "Include" : "Exclude";
  const persen = Number(tax_percent);
  if (!Number.isFinite(persen) || persen < 0 || persen > 100) {
    throw new Error("Tarif PPN harus angka antara 0 dan 100.");
  }

  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: organizationId,
      ...clean,
      logo: logoBersih,
      tax_mode: mode,
      tax_percent: persen,
      tax_dpp_nilai_lain: tax_dpp_nilai_lain !== false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  if (error) throw new Error(error.message);

  // Mode pajak ikut menentukan angka di form penjualan, jadi layar yang
  // sudah ter-cache harus ikut segar.
  revalidatePath("/settings");
  revalidatePath("/sales-invoices/new");
  revalidatePath("/pos");
  revalidatePath("/consignments");
}
