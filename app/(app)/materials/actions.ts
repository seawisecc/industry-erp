"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type InciRow = {
  inci_master_id: string;
  inci_name: string;
  percentage: number;
};

type MaterialPayload = {
  material_code: string;
  tradename: string;
  supplier_id: string | null;
  origin: string | null;
  noc: string | null;
  kategori: "Bahan Baku" | "Kemasan";
  keterangan: string | null;
  inci_rows: InciRow[];
};

export async function createMaterial(data: MaterialPayload) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  if (!data.material_code || !data.tradename) {
    throw new Error("Kode material & tradename wajib diisi");
  }

  // Cegah double input: kode material sama (case-insensitive) di org ini
  const { data: dup } = await supabase
    .from("materials")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("material_code", data.material_code.trim());
  if (dup && dup.length > 0) {
    throw new Error(`Kode material "${data.material_code.trim()}" sudah terdaftar`);
  }

  const { data: material, error } = await supabase
    .from("materials")
    .insert({
      material_code: data.material_code.trim(),
      tradename: data.tradename.trim(),
      supplier_id: data.supplier_id || null,
      origin: data.origin || null,
      noc: data.noc || null,
      kategori: data.kategori,
      keterangan: data.keterangan,
      organization_id: organizationId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

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

export async function updateMaterial(id: string, data: MaterialPayload) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!data.material_code || !data.tradename) {
    throw new Error("Kode material & tradename wajib diisi");
  }

  // Cegah double input: kode sama di material LAIN (case-insensitive)
  const { data: dup } = await supabase
    .from("materials")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("material_code", data.material_code.trim())
    .neq("id", id);
  if (dup && dup.length > 0) {
    throw new Error(`Kode material "${data.material_code.trim()}" sudah terdaftar`);
  }

  const { error } = await supabase
    .from("materials")
    .update({
      material_code: data.material_code.trim(),
      tradename: data.tradename.trim(),
      supplier_id: data.supplier_id || null,
      origin: data.origin || null,
      noc: data.noc || null,
      kategori: data.kategori,
      keterangan: data.keterangan,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  // Sinkron kode item yang ter-link (satu penomoran material = item)
  const { data: matRow } = await supabase
    .from("materials")
    .select("item_id")
    .eq("id", id)
    .single();
  if (matRow?.item_id) {
    await supabase
      .from("items")
      .update({ kode: data.material_code.trim() })
      .eq("id", matRow.item_id);
  }

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