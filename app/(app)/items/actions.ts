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

export async function createItemsFromMaterials(
  rows: { material_id: string; satuan: string; stok_minimum: number }[]
): Promise<{ ok: boolean; error?: string; count?: number }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();

    if (!organizationId) {
      throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
    }
    if (!rows || rows.length === 0)
      throw new Error("Tidak ada material yang dipilih");
    for (const r of rows) {
      if (!r.satuan?.trim()) throw new Error("Satuan wajib diisi di semua baris terpilih");
    }

    // Ambil material terpilih & pastikan belum ter-link ke item
    const { data: materials, error: mError } = await supabase
      .from("materials")
      .select("id, tradename, kategori, item_id")
      .eq("organization_id", organizationId)
      .in(
        "id",
        rows.map((r) => r.material_id)
      );
    if (mError) throw new Error(mError.message);

    let count = 0;
    for (const r of rows) {
      const mat = (materials || []).find((m) => m.id === r.material_id);
      if (!mat) throw new Error("Ada material yang tidak ditemukan");
      if (mat.item_id) continue; // sudah pernah dibuatkan item — lewati

      const { data: item, error } = await supabase
        .from("items")
        .insert({
          nama: mat.tradename,
          kategori: mat.kategori,
          satuan: r.satuan.trim(),
          stok_minimum: r.stok_minimum || 0,
          organization_id: organizationId,
        })
        .select()
        .single();
      if (error) throw new Error(`${mat.tradename}: ${error.message}`);

      const { error: linkError } = await supabase
        .from("materials")
        .update({ item_id: item.id })
        .eq("id", mat.id);
      if (linkError) throw new Error(linkError.message);

      count++;
    }

    revalidatePath("/items");
    revalidatePath("/materials");
    return { ok: true, count };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Gagal membuat item",
    };
  }
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