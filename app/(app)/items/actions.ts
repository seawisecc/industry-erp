"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export async function createItem(data: {
  nama: string;
  kategori: "Bahan Baku" | "Kemasan";
  satuan: string;
  stok_minimum: number;
  material_id: string | null;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }

  if (!data.nama || !data.satuan) {
    throw new Error("Nama & satuan wajib diisi");
  }

  // 1. Buat item (kode ITM-XXXX dibuat otomatis oleh trigger database)
  const { data: item, error } = await supabase
    .from("items")
    .insert({
      nama: data.nama.trim(),
      kategori: data.kategori,
      satuan: data.satuan.trim(),
      stok_minimum: data.stok_minimum || 0,
      organization_id: organizationId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  // 2. Kalau dipilih Material, tautkan material itu ke item ini
  if (data.material_id) {
    const { error: linkError } = await supabase
      .from("materials")
      .update({ item_id: item.id })
      .eq("id", data.material_id);

    if (linkError) {
      throw new Error(linkError.message);
    }
  }

  revalidatePath("/items");
  return { success: true };
}

export async function updateItem(
  id: string,
  data: {
    nama: string;
    kategori: "Bahan Baku" | "Kemasan";
    satuan: string;
    stok_minimum: number;
    material_id: string | null;
  }
) {
  const supabase = await createClient();

  if (!data.nama || !data.satuan) {
    throw new Error("Nama & satuan wajib diisi");
  }

  const { error } = await supabase
    .from("items")
    .update({
      nama: data.nama.trim(),
      kategori: data.kategori,
      satuan: data.satuan.trim(),
      stok_minimum: data.stok_minimum || 0,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  // Lepas link material lama dari item ini, lalu pasang yang baru (kalau ada)
  await supabase.from("materials").update({ item_id: null }).eq("item_id", id);

  if (data.material_id) {
    const { error: linkError } = await supabase
      .from("materials")
      .update({ item_id: id })
      .eq("id", data.material_id);

    if (linkError) {
      throw new Error(linkError.message);
    }
  }

  revalidatePath("/items");
  return { success: true };
}