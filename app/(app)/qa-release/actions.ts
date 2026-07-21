"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type QaChecklistItem = { key: string; label: string; ok: boolean };

/** Keputusan QA berdasarkan tinjauan bukti + checklist pelulusan. */
export async function decideQaReview(
  batchId: string,
  status: "Released" | "Rejected",
  checklist: QaChecklistItem[],
  note: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    const bolehQa =
      isSuperAdmin || profile?.role === "Admin" || profile?.can_qa === true;
    if (!bolehQa)
      throw new Error("Hanya petugas dengan izin QA yang bisa melakukan ini");
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (status === "Rejected" && !note?.trim())
      throw new Error("Alasan reject wajib diisi di catatan QA");
    if (status === "Released" && checklist.some((c) => !c.ok))
      throw new Error("Seluruh poin checklist harus diverifikasi dulu");

    const { data: batch } = await supabase
      .from("production_batches")
      .select("id, qa_status")
      .eq("id", batchId)
      .eq("organization_id", organizationId)
      .single();
    if (!batch) throw new Error("Batch tidak ditemukan");
    if (batch.qa_status !== "Hold") throw new Error("Batch ini sudah diproses QA");

    const { error } = await supabase
      .from("production_batches")
      .update({
        qa_status: status,
        qa_checklist: checklist,
        qa_note: note?.trim() || null,
        qa_oleh: profile?.nama || null,
        qa_tanggal: new Date().toLocaleDateString("sv-SE"),
      })
      .eq("id", batchId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    revalidatePath("/qa-release");
    revalidatePath("/finished-goods");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

async function setQaStatus(
  batchId: string,
  status: "Released" | "Rejected",
  note: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    const bolehQa =
      isSuperAdmin || profile?.role === "Admin" || profile?.can_qa === true;
    if (!bolehQa)
      throw new Error("Hanya petugas dengan izin QA yang bisa melakukan ini");
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (status === "Rejected" && !note?.trim())
      throw new Error("Alasan reject wajib diisi");

    const { data: batch } = await supabase
      .from("production_batches")
      .select("id, qa_status")
      .eq("id", batchId)
      .eq("organization_id", organizationId)
      .single();
    if (!batch) throw new Error("Batch tidak ditemukan");
    if (batch.qa_status !== "Hold")
      throw new Error("Batch ini sudah diproses QA");

    const { error } = await supabase
      .from("production_batches")
      .update({
        qa_status: status,
        qa_note: note?.trim() || null,
        qa_oleh: profile?.nama || null,
        qa_tanggal: new Date().toLocaleDateString("sv-SE"),
      })
      .eq("id", batchId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    revalidatePath("/qa-release");
    revalidatePath("/finished-goods");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

/** Release: batch lulus QA — produk jadi masuk stok jual. */
export async function qaReleaseBatch(batchId: string, note: string | null) {
  return setQaStatus(batchId, "Released", note);
}

/** Reject: batch tidak lulus — produk jadi tidak pernah masuk stok jual. */
export async function qaRejectBatch(batchId: string, note: string) {
  return setQaStatus(batchId, "Rejected", note);
}
