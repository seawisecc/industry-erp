"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type QcHasilRow = {
  nama: string;
  satuan: string | null;
  spesifikasi: string | null;
  grup: string | null;
  hasil: string;
};

export type QcSheetInput = {
  jumlah_sampel: string | null;
  tanggal_sampling: string | null;
  tanggal_uji: string | null;
  hasil: QcHasilRow[];
  note: string | null;
};

/**
 * Simpan spesifikasi yang diisi QC ke master bahan (items.qc_spec) supaya
 * pengujian berikutnya untuk bahan yang sama langsung terisi sendiri.
 */
async function simpanSpecKeItem(
  organizationId: string,
  itemId: string,
  hasil: QcHasilRow[]
) {
  const supabase = await createClient();
  const spec: Record<string, string> = {};
  for (const h of hasil) {
    if (h.spesifikasi?.trim()) spec[h.nama] = h.spesifikasi.trim();
  }
  if (Object.keys(spec).length === 0) return;

  const { data: item } = await supabase
    .from("items")
    .select("qc_spec")
    .eq("id", itemId)
    .eq("organization_id", organizationId)
    .single();

  const merged = {
    ...((item?.qc_spec as Record<string, string> | null) || {}),
    ...spec,
  };
  await supabase
    .from("items")
    .update({ qc_spec: merged })
    .eq("id", itemId)
    .eq("organization_id", organizationId);
}

/** Simpan lembar pengujian tanpa memutuskan release/reject (draft). */
export async function saveQcSheet(
  batchId: string,
  sheet: QcSheetInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    const bolehQc =
      isSuperAdmin || profile?.role === "Admin" || profile?.can_qc === true;
    if (!bolehQc)
      throw new Error("Hanya petugas dengan izin QC yang bisa melakukan ini");
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { data: batch, error } = await supabase
      .from("purchase_batches")
      .update({
        qc_jumlah_sampel: sheet.jumlah_sampel?.trim() || null,
        qc_tanggal_sampling: sheet.tanggal_sampling || null,
        qc_tanggal_uji: sheet.tanggal_uji || null,
        qc_hasil: sheet.hasil,
        qc_note: sheet.note?.trim() || null,
      })
      .eq("id", batchId)
      .eq("organization_id", organizationId)
      .select("item_id")
      .single();
    if (error) throw new Error(error.message);

    if (batch?.item_id)
      await simpanSpecKeItem(organizationId, batch.item_id, sheet.hasil);

    revalidatePath("/qc-incoming");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}

/**
 * Keputusan QC. Release: stok karantina pindah ke qty_sisa (siap pakai FEFO).
 * Reject: stok hangus & tercatat di audit log.
 */
export async function decideQc(
  batchId: string,
  status: "Released" | "Rejected",
  sheet: QcSheetInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    const bolehQc =
      isSuperAdmin || profile?.role === "Admin" || profile?.can_qc === true;
    if (!bolehQc)
      throw new Error("Hanya petugas dengan izin QC yang bisa melakukan ini");
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (status === "Rejected" && !sheet.note?.trim())
      throw new Error("Alasan reject wajib diisi di catatan QC");

    const { data: batch } = await supabase
      .from("purchase_batches")
      .select("id, item_id, qc_status, qty_karantina")
      .eq("id", batchId)
      .eq("organization_id", organizationId)
      .single();
    if (!batch) throw new Error("Batch tidak ditemukan");
    if (batch.qc_status !== "Karantina")
      throw new Error("Batch ini sudah diproses QC");

    const qty = Number(batch.qty_karantina);
    const { error } = await supabase
      .from("purchase_batches")
      .update({
        qc_status: status,
        qty_sisa: status === "Released" ? qty : 0,
        qty_karantina: 0,
        qc_jumlah_sampel: sheet.jumlah_sampel?.trim() || null,
        qc_tanggal_sampling: sheet.tanggal_sampling || null,
        qc_tanggal_uji: sheet.tanggal_uji || null,
        qc_hasil: sheet.hasil,
        qc_note: sheet.note?.trim() || null,
        qc_oleh: profile?.nama || null,
        qc_tanggal: new Date().toLocaleDateString("sv-SE"),
      })
      .eq("id", batchId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    await simpanSpecKeItem(organizationId, batch.item_id, sheet.hasil);

    if (status === "Rejected") {
      await supabase.from("batch_dispositions").insert({
        batch_id: batchId,
        item_id: batch.item_id,
        tipe: "QC Reject",
        qty,
        catatan: sheet.note!.trim(),
        dibuat_oleh: profile?.id || null,
        organization_id: organizationId,
      });
    }

    revalidatePath("/qc-incoming");
    revalidatePath("/items");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
