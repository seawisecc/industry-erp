"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import {
  pengesahQr,
  type DocTypeKey,
  type QrSignDoc,
  type SignSlot,
} from "@/lib/docSign";

export type DocSignPayload = {
  doc_type: DocTypeKey;
  slots: SignSlot[];
  qr_sign: QrSignDoc;
}[];

// Simpan pengaturan pengesahan semua jenis dokumen sekaligus (Admin saja)
export async function saveDocSignSettings(
  payload: DocSignPayload
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!isSuperAdmin && profile?.role !== "Admin")
      throw new Error("Hanya Admin yang bisa mengubah pengaturan ini");

    // Aturan yang sama dengan di form, ditegakkan lagi di sini: form bisa
    // dilewati, server action tidak. QR yang menunjuk pengesah kosong akan
    // menerbitkan dokumen yang tampak sah tanpa ada yang bertanggung jawab.
    for (const p of payload) {
      if (p.qr_sign?.aktif && !pengesahQr(p.slots, p.qr_sign))
        throw new Error(
          "Pengesah QR harus kolom tanda tangan yang aktif dan lengkap nama serta jabatannya."
        );
    }

    const { error } = await supabase.from("doc_sign_settings").upsert(
      payload.map((p) => ({
        organization_id: organizationId,
        doc_type: p.doc_type,
        slots: p.slots.map((s) => ({
          key: s.key,
          label: s.label,
          nama: s.nama.trim(),
          jabatan: s.jabatan.trim(),
          aktif: s.aktif,
        })),
        qr_sign: { aktif: p.qr_sign?.aktif === true, slot: p.qr_sign?.slot },
      })),
      { onConflict: "organization_id,doc_type" }
    );
    if (error) throw new Error(error.message);

    revalidatePath("/document-signing");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal menyimpan" };
  }
}
