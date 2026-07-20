"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";


// Kode fallback ITM-XXXX (untuk item tanpa material)
async function nextItemKode(organizationId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("items")
    .select("kode")
    .eq("organization_id", organizationId)
    .like("kode", "ITM-%")
    .order("kode", { ascending: false })
    .limit(1);
  const last = data?.[0]?.kode as string | undefined;
  const lastNum = last ? parseInt(last.slice(4)) || 0 : 0;
  return "ITM-" + String(lastNum + 1).padStart(4, "0");
}

export async function createItem(data: {
  nama: string;
  kategori: "Bahan Baku" | "Kemasan";
  satuan: string;
  stok_minimum: number;
  moq: number | null;
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

  // Cegah double input: nama sama (case-insensitive) di org ini
  const { data: dup } = await supabase
    .from("items")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("nama", data.nama.trim());
  if (dup && dup.length > 0) {
    throw new Error(`Item "${data.nama.trim()}" sudah terdaftar`);
  }

  // 1. Tentukan kode: ikut kode material bila ter-link, fallback ITM-XXXX
  let kode: string | null = null;
  if (data.material_id) {
    const { data: mat } = await supabase
      .from("materials")
      .select("material_code")
      .eq("id", data.material_id)
      .eq("organization_id", organizationId)
      .single();
    kode = mat?.material_code || null;
  }
  if (!kode) kode = await nextItemKode(organizationId);

  const { data: item, error } = await supabase
    .from("items")
    .insert({
      kode,
      nama: data.nama.trim(),
      kategori: data.kategori,
      satuan: data.satuan.trim(),
      stok_minimum: data.stok_minimum || 0,
      moq: data.moq,
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
      .select("id, material_code, tradename, kategori, item_id")
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
          kode: mat.material_code,
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
    moq: number | null;
    material_id: string | null;
  }
) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!data.nama || !data.satuan) {
    throw new Error("Nama & satuan wajib diisi");
  }

  // Cegah double input: nama sama di item LAIN (case-insensitive)
  const { data: dup } = await supabase
    .from("items")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("nama", data.nama.trim())
    .neq("id", id);
  if (dup && dup.length > 0) {
    throw new Error(`Item "${data.nama.trim()}" sudah terdaftar`);
  }

  // Kalau ter-link material, kode item ikut kode material
  let kodeUpdate: { kode: string } | Record<string, never> = {};
  if (data.material_id) {
    const { data: mat } = await supabase
      .from("materials")
      .select("material_code")
      .eq("id", data.material_id)
      .eq("organization_id", organizationId)
      .single();
    if (mat?.material_code) kodeUpdate = { kode: mat.material_code };
  }

  const { error } = await supabase
    .from("items")
    .update({
      ...kodeUpdate,
      nama: data.nama.trim(),
      kategori: data.kategori,
      satuan: data.satuan.trim(),
      stok_minimum: data.stok_minimum || 0,
      moq: data.moq,
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