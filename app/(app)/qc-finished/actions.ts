"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";

export type QcProdukHasil = {
  nama: string;
  satuan: string | null;
  spesifikasi: string | null;
  grup: string | null;
  hasil: string;
};

export type QcProdukSheet = {
  jumlah_sampel: string | null;
  tanggal_uji: string | null;
  hasil: QcProdukHasil[];
  note: string | null;
  selesai: boolean; // true = QC menyatakan pengujian selesai
};

/** Spesifikasi produk jadi tersimpan ke master produk untuk batch berikutnya. */
async function simpanSpecKeProduk(
  organizationId: string,
  productId: string,
  hasil: QcProdukHasil[]
) {
  const supabase = await createClient();
  const spec: Record<string, string> = {};
  for (const h of hasil) {
    if (h.spesifikasi?.trim()) spec[h.nama] = h.spesifikasi.trim();
  }
  if (Object.keys(spec).length === 0) return;

  const { data: prod } = await supabase
    .from("products")
    .select("qa_spec")
    .eq("id", productId)
    .eq("organization_id", organizationId)
    .single();

  await supabase
    .from("products")
    .update({
      qa_spec: {
        ...((prod?.qa_spec as Record<string, string> | null) || {}),
        ...spec,
      },
    })
    .eq("id", productId)
    .eq("organization_id", organizationId);
}

/** Simpan hasil uji produk jadi (dikerjakan tim QC). */
export async function saveQcProduk(
  batchId: string,
  productId: string | null,
  sheet: QcProdukSheet
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    const bolehQc =
      isSuperAdmin || profile?.role === "Admin" || profile?.can_qc === true;
    if (!bolehQc)
      throw new Error("Hanya petugas dengan izin QC yang bisa melakukan ini");
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");

    const { error } = await supabase
      .from("production_batches")
      .update({
        qc_produk_jumlah_sampel: sheet.jumlah_sampel?.trim() || null,
        qc_produk_tanggal_uji: sheet.tanggal_uji || null,
        qc_produk_hasil: sheet.hasil,
        qc_produk_note: sheet.note?.trim() || null,
        qc_produk_selesai: sheet.selesai,
        qc_produk_oleh: sheet.selesai ? profile?.nama || null : null,
      })
      .eq("id", batchId)
      .eq("organization_id", organizationId);
    if (error) throw new Error(error.message);

    if (productId) await simpanSpecKeProduk(organizationId, productId, sheet.hasil);

    revalidatePath("/qc-finished");
    revalidatePath("/qa-release");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal" };
  }
}
