"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export async function retestBatch(
  batchId: string,
  newExpDate: string,
  letterNote: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    if (!newExpDate) throw new Error("Tanggal expired baru wajib diisi");
    if (!letterNote?.trim())
      throw new Error("No. re-test letter / catatan wajib diisi");

    const { data: batch } = await supabase
      .from("purchase_batches")
      .select("id, item_id, exp_date")
      .eq("id", batchId)
      .eq("organization_id", organizationId)
      .single();
    if (!batch) throw new Error("Batch tidak ditemukan");
    if (batch.exp_date && newExpDate <= batch.exp_date)
      throw new Error("Exp baru harus lebih lambat dari exp lama");

    const { error } = await supabase
      .from("purchase_batches")
      .update({ exp_date: newExpDate, retest_note: letterNote.trim() })
      .eq("id", batchId);
    if (error) throw new Error(error.message);

    const { error: logError } = await supabase.from("batch_dispositions").insert({
      batch_id: batchId,
      item_id: batch.item_id,
      tipe: "Re-test",
      exp_lama: batch.exp_date,
      exp_baru: newExpDate,
      catatan: letterNote.trim(),
      dibuat_oleh: profile?.id || null,
      organization_id: organizationId,
    });
    if (logError) throw new Error(logError.message);

    revalidatePath("/items");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

export async function destroyBatch(
  batchId: string,
  alasan: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    if (!alasan?.trim()) throw new Error("Alasan pemusnahan wajib diisi");

    const { data: batch } = await supabase
      .from("purchase_batches")
      .select("id, item_id, qty_sisa, exp_date")
      .eq("id", batchId)
      .eq("organization_id", organizationId)
      .single();
    if (!batch) throw new Error("Batch tidak ditemukan");
    if (Number(batch.qty_sisa) <= 0) throw new Error("Batch sudah kosong");

    const { error } = await supabase
      .from("purchase_batches")
      .update({ qty_sisa: 0 })
      .eq("id", batchId);
    if (error) throw new Error(error.message);

    const { error: logError } = await supabase.from("batch_dispositions").insert({
      batch_id: batchId,
      item_id: batch.item_id,
      tipe: "Musnah",
      qty: Number(batch.qty_sisa),
      exp_lama: batch.exp_date,
      catatan: alasan.trim(),
      dibuat_oleh: profile?.id || null,
      organization_id: organizationId,
    });
    if (logError) throw new Error(logError.message);

    revalidatePath("/items");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
