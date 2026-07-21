"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type FormulaInput = {
  item_id: string;
  percentage: number;
  fase: string | null; // pengelompokan fase (A/B/C) — opsional
};

export type StepInput = {
  instruksi: string;
  suhu: string | null;
  rpm: string | null;
  durasi: string | null;
};

export type VariantInput = {
  nama_varian: string;
  netto: number;
  satuan_netto: string;
  harga_jual: number | null;
  packaging: { item_id: string; qty_per_pcs: number }[];
};

export type ProductInput = {
  kode: string | null; // manual (bebas format) — kosong = otomatis PRD-XXXX
  nama_produk: string;
  brand: string | null;
  kategori: string | null;
  batch_size_kg: number | null;
  aktif: boolean;
  formulas: FormulaInput[];
  steps: StepInput[];
  variants: VariantInput[];
};

// Kode otomatis PRD-XXXX (lanjut dari nomor PRD- terbesar di org ini)
async function nextProductKode(organizationId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("kode")
    .eq("organization_id", organizationId)
    .like("kode", "PRD-%")
    .order("kode", { ascending: false })
    .limit(1);
  const last = data?.[0]?.kode as string | undefined;
  const lastNum = last ? parseInt(last.slice(4)) || 0 : 0;
  return "PRD-" + String(lastNum + 1).padStart(4, "0");
}

// Pastikan kode belum dipakai produk lain di org ini
async function assertKodeUnik(
  organizationId: string,
  kode: string,
  excludeId?: string
) {
  const supabase = await createClient();
  const q = supabase
    .from("products")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("kode", kode);
  const { data: dup } = excludeId ? await q.neq("id", excludeId) : await q;
  if (dup && dup.length > 0) {
    throw new Error(`Kode produk "${kode}" sudah dipakai`);
  }
}

function validateProduct(data: ProductInput) {
  if (!data.nama_produk?.trim()) throw new Error("Nama produk wajib diisi");

  for (const f of data.formulas) {
    if (!f.item_id) throw new Error("Ada baris formulasi yang belum dipilih itemnya");
    if (!f.percentage || f.percentage <= 0)
      throw new Error("Persentase formulasi harus lebih dari 0");
  }
  const fIds = data.formulas.map((f) => f.item_id);
  if (new Set(fIds).size !== fIds.length)
    throw new Error("Ada bahan yang dipakai dua kali di formulasi");

  const vNames = data.variants.map((v) => v.nama_varian.trim().toLowerCase());
  if (new Set(vNames).size !== vNames.length)
    throw new Error("Ada varian dengan ukuran yang sama");

  for (const v of data.variants) {
    if (!v.nama_varian?.trim()) throw new Error("Ukuran varian wajib diisi");
    if (!v.netto || v.netto <= 0)
      throw new Error("Netto varian harus lebih dari 0");
    for (const p of v.packaging) {
      if (!p.item_id)
        throw new Error(`Ada kemasan di varian ${v.nama_varian} yang belum dipilih`);
      if (!p.qty_per_pcs || p.qty_per_pcs <= 0)
        throw new Error("Qty kemasan per pcs harus lebih dari 0");
    }
    const pIds = v.packaging.map((p) => p.item_id);
    if (new Set(pIds).size !== pIds.length)
      throw new Error(`Ada kemasan dobel di varian ${v.nama_varian}`);
  }
}

async function insertFormulasAndVariants(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  organizationId: string,
  data: ProductInput
) {
  if (data.formulas.length > 0) {
    const { error } = await supabase.from("product_formulas").insert(
      data.formulas.map((f) => ({
        product_id: productId,
        item_id: f.item_id,
        percentage: f.percentage,
        fase: f.fase,
        organization_id: organizationId,
      }))
    );
    if (error) throw new Error(error.message);
  }

  if (data.steps.length > 0) {
    const { error } = await supabase.from("product_process_steps").insert(
      data.steps.map((s, i) => ({
        product_id: productId,
        urutan: i + 1,
        instruksi: s.instruksi,
        suhu: s.suhu,
        rpm: s.rpm,
        durasi: s.durasi,
        organization_id: organizationId,
      }))
    );
    if (error) throw new Error(error.message);
  }

  for (const v of data.variants) {
    const { data: variant, error } = await supabase
      .from("product_variants")
      .insert({
        product_id: productId,
        nama_varian: v.nama_varian.trim(),
        netto: v.netto,
        satuan_netto: v.satuan_netto,
        harga_jual: v.harga_jual,
        organization_id: organizationId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (v.packaging.length > 0) {
      const { error: pError } = await supabase.from("variant_packaging").insert(
        v.packaging.map((p) => ({
          variant_id: variant.id,
          item_id: p.item_id,
          qty_per_pcs: p.qty_per_pcs,
          organization_id: organizationId,
        }))
      );
      if (pError) throw new Error(pError.message);
    }
  }
}

export async function createProduct(data: ProductInput) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }
  validateProduct(data);

  // Kode: manual kalau diisi (gaya raw material), otomatis PRD-XXXX kalau kosong
  const kode = data.kode?.trim() || (await nextProductKode(organizationId));
  await assertKodeUnik(organizationId, kode);

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      kode,
      nama_produk: data.nama_produk.trim(),
      brand: data.brand?.trim() || null,
      kategori: data.kategori?.trim() || null,
      batch_size_kg: data.batch_size_kg,
      aktif: data.aktif,
      organization_id: organizationId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  try {
    await insertFormulasAndVariants(supabase, product.id, organizationId, data);
  } catch (err) {
    await supabase.from("products").delete().eq("id", product.id);
    throw err;
  }

  revalidatePath("/products");
  return { success: true };
}

export async function updateProduct(id: string, data: ProductInput) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }
  validateProduct(data);

  // Kode wajib saat edit (field sudah terisi kode lama di form)
  const kode = data.kode?.trim();
  if (!kode) throw new Error("Kode produk wajib diisi");
  await assertKodeUnik(organizationId, kode, id);

  const { error } = await supabase
    .from("products")
    .update({
      kode,
      nama_produk: data.nama_produk.trim(),
      brand: data.brand?.trim() || null,
      kategori: data.kategori?.trim() || null,
      batch_size_kg: data.batch_size_kg,
      aktif: data.aktif,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  // Ganti seluruh formulasi & varian (packaging ikut terhapus via cascade)
  const { error: delF } = await supabase
    .from("product_formulas")
    .delete()
    .eq("product_id", id);
  if (delF) throw new Error(delF.message);

  const { error: delV } = await supabase
    .from("product_variants")
    .delete()
    .eq("product_id", id);
  if (delV) throw new Error(delV.message);

  const { error: delS } = await supabase
    .from("product_process_steps")
    .delete()
    .eq("product_id", id);
  if (delS) throw new Error(delS.message);

  await insertFormulasAndVariants(supabase, id, organizationId, data);

  revalidatePath("/products");
  return { success: true };
}
