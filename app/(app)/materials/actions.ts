"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type InciRow = {
  inci_master_id: string;
  inci_name: string;
  percentage: number;
};

export async function createMaterial(data: {
  material_code: string;
  tradename: string;
  supplier_id: string | null;
  origin: string | null;
  noc: string | null;
  inci_rows: InciRow[];
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  if (!data.material_code || !data.tradename) {
    throw new Error("Kode material & tradename wajib diisi");
  }

  // 1. Simpan material utama
  const { data: material, error } = await supabase
    .from("materials")
    .insert({
      material_code: data.material_code.trim(),
      tradename: data.tradename.trim(),
      supplier_id: data.supplier_id || null,
      origin: data.origin || null,
      noc: data.noc || null,
      organization_id: organizationId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  // 2. Simpan baris komposisi INCI-nya
  const validInci = data.inci_rows.filter((r) => r.inci_name && r.percentage >= 0);
  if (validInci.length > 0) {
    const { error: inciError } = await supabase.from("material_inci").insert(
      validInci.map((r) => ({
        material_id: material.id,
        inci_master_id: r.inci_master_id || null,
        inci_name: r.inci_name,
        percentage: r.percentage,
        organization_id: organizationId,
      }))
    );

    if (inciError) {
      throw new Error(inciError.message);
    }
  }

  revalidatePath("/materials");
  return { success: true };
}

export async function updateMaterial(
  id: string,
  data: {
    material_code: string;
    tradename: string;
    supplier_id: string | null;
    origin: string | null;
    noc: string | null;
    inci_rows: InciRow[];
  }
) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!data.material_code || !data.tradename) {
    throw new Error("Kode material & tradename wajib diisi");
  }

  const { error } = await supabase
    .from("materials")
    .update({
      material_code: data.material_code.trim(),
      tradename: data.tradename.trim(),
      supplier_id: data.supplier_id || null,
      origin: data.origin || null,
      noc: data.noc || null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  // Hapus komposisi lama, tulis ulang dari data terbaru (paling sederhana & aman)
  await supabase.from("material_inci").delete().eq("material_id", id);

  const validInci = data.inci_rows.filter((r) => r.inci_name && r.percentage >= 0);
  if (validInci.length > 0) {
    const { error: inciError } = await supabase.from("material_inci").insert(
      validInci.map((r) => ({
        material_id: id,
        inci_master_id: r.inci_master_id || null,
        inci_name: r.inci_name,
        percentage: r.percentage,
        organization_id: organizationId,
      }))
    );

    if (inciError) {
      throw new Error(inciError.message);
    }
  }

  revalidatePath("/materials");
  return { success: true };
}