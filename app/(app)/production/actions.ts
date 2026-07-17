"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type ProductionInput = {
  no_batch: string;
  tanggal: string; // yyyy-mm-dd
  catatan: string | null;
  product_id: string;
  outputs: { varian_ukuran: string; qty_hasil: number; satuan: string }[];
  components: { item_id: string; qty: number }[];
};

// ================= PLAN → EXECUTION → RESULT =================

export type ExecutionData = {
  bahan: { item_id: string; teoritis: number; real: number }[];
  adjust: { item_id: string; qty: number }[];
  variants: { nama_varian: string; rencana_pcs: number }[];
  kemasan: { item_id: string; qty: number }[];
};

async function requirePlanner() {
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Refresh halaman dan login ulang.");
  }
  const boleh =
    isSuperAdmin || profile?.role === "Admin" || profile?.can_plan_production;
  if (!boleh) {
    throw new Error(
      "Kamu tidak punya izin membuat instruksi produksi. Minta Admin mengaktifkannya di menu Pengguna."
    );
  }
  return { profile, organizationId };
}

export async function createPlan(data: {
  product_id: string;
  no_batch: string;
  jumlah_batch: number;
  tanggal_rencana: string;
  catatan: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await requirePlanner();

    if (!data.product_id) throw new Error("Produk wajib dipilih");
    if (!data.no_batch?.trim()) throw new Error("No. batch wajib diisi");
    if (!data.jumlah_batch || data.jumlah_batch <= 0)
      throw new Error("Jumlah batch harus lebih dari 0");
    if (!data.tanggal_rencana) throw new Error("Tanggal rencana wajib diisi");

    const { error } = await supabase.from("production_plans").insert({
      product_id: data.product_id,
      no_batch: data.no_batch.trim(),
      jumlah_batch: data.jumlah_batch,
      tanggal_rencana: data.tanggal_rencana,
      catatan: data.catatan?.trim() || null,
      dibuat_oleh: profile?.id || null,
      organization_id: organizationId,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/production");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function deletePlan(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await requirePlanner();

    const { data: plan } = await supabase
      .from("production_plans")
      .select("id, status")
      .eq("id", id)
      .single();
    if (!plan) throw new Error("Plan tidak ditemukan");
    if (plan.status === "Selesai")
      throw new Error("Plan yang sudah selesai tidak bisa dihapus");

    const { error } = await supabase.from("production_plans").delete().eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath("/production");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function saveExecution(
  planId: string,
  data: ExecutionData
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { data: plan } = await supabase
      .from("production_plans")
      .select("id, status")
      .eq("id", planId)
      .eq("organization_id", organizationId)
      .single();
    if (!plan) throw new Error("Plan tidak ditemukan");
    if (plan.status === "Selesai") throw new Error("Plan ini sudah selesai");

    const { error } = await supabase
      .from("production_plans")
      .update({ execution_data: data, status: "Sedang Produksi" })
      .eq("id", planId);
    if (error) throw new Error(error.message);

    revalidatePath("/production");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function finishProduction(
  planId: string,
  outputs: { varian_ukuran: string; qty_hasil: number }[]
): Promise<{ ok: boolean; error?: string; batchId?: string }> {
  try {
    const supabase = await createClient();
    const { organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { data: plan } = await supabase
      .from("production_plans")
      .select("id, no_batch, product_id, status, execution_data, catatan")
      .eq("id", planId)
      .eq("organization_id", organizationId)
      .single();
    if (!plan) throw new Error("Plan tidak ditemukan");
    if (plan.status === "Selesai") throw new Error("Plan ini sudah selesai");
    if (!plan.execution_data)
      throw new Error("Isi data eksekusi (penimbangan) dulu sebelum input hasil");

    const exec = plan.execution_data as ExecutionData;
    const realOutputs = outputs.filter((o) => o.qty_hasil > 0);
    if (realOutputs.length === 0)
      throw new Error("Minimal satu varian dengan hasil real lebih dari 0");

    // Komponen = bahan (timbangan REAL) + kemasan real + adjusting
    const merged = new Map<string, number>();
    for (const b of exec.bahan || []) {
      if (b.real > 0) merged.set(b.item_id, (merged.get(b.item_id) || 0) + b.real);
    }
    for (const k of exec.kemasan || []) {
      if (k.qty > 0) merged.set(k.item_id, (merged.get(k.item_id) || 0) + k.qty);
    }
    for (const a of exec.adjust || []) {
      if (a.qty > 0) merged.set(a.item_id, (merged.get(a.item_id) || 0) + a.qty);
    }
    const components = Array.from(merged, ([item_id, qty]) => ({ item_id, qty }));
    if (components.length === 0)
      throw new Error("Tidak ada bahan terpakai di data eksekusi");

    const { data: batchId, error } = await supabase.rpc("create_production", {
      p_organization_id: organizationId,
      p_no_batch: plan.no_batch,
      p_tanggal: new Date().toLocaleDateString("sv-SE"),
      p_catatan: plan.catatan,
      p_product_id: plan.product_id,
      p_outputs: realOutputs.map((o) => ({ ...o, satuan: "pcs" })),
      p_components: components,
    });
    if (error) throw new Error(error.message);

    const { error: updError } = await supabase
      .from("production_plans")
      .update({ status: "Selesai", production_batch_id: batchId as string })
      .eq("id", planId);
    if (updError) throw new Error(updError.message);

    revalidatePath("/production");
    revalidatePath("/items");
    revalidatePath("/finished-goods");
    revalidatePath("/dashboard");
    return { ok: true, batchId: batchId as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function createProduction(data: ProductionInput) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  if (!organizationId) {
    throw new Error("Organisasi tidak terdeteksi. Coba refresh halaman dan login ulang.");
  }
  if (!data.no_batch?.trim()) throw new Error("No. batch produksi wajib diisi");
  if (!data.tanggal) throw new Error("Tanggal produksi wajib diisi");
  if (!data.product_id) throw new Error("Produk wajib dipilih");

  const outputs = data.outputs.filter((o) => o.qty_hasil > 0);
  if (outputs.length === 0)
    throw new Error("Minimal satu varian dengan qty hasil lebih dari 0");

  // Gabungkan bahan yang sama (misal kemasan dipakai 2 varian) jadi satu baris
  const merged = new Map<string, number>();
  for (const c of data.components) {
    if (!c.item_id || c.qty <= 0) continue;
    merged.set(c.item_id, (merged.get(c.item_id) || 0) + c.qty);
  }
  const components = Array.from(merged, ([item_id, qty]) => ({ item_id, qty }));
  if (components.length === 0)
    throw new Error("Minimal satu bahan dengan qty lebih dari 0");

  // Semua pemotongan stok terjadi atomic di dalam Postgres function (FEFO)
  const { data: batchId, error } = await supabase.rpc("create_production", {
    p_organization_id: organizationId,
    p_no_batch: data.no_batch.trim(),
    p_tanggal: data.tanggal,
    p_catatan: data.catatan,
    p_product_id: data.product_id,
    p_outputs: outputs,
    p_components: components,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/production");
  revalidatePath("/items");
  revalidatePath("/dashboard");
  return { success: true, batchId: batchId as string };
}
