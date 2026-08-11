"use server";

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { revalidatePath } from "next/cache";
import type { DocTypeKey, SignSlot } from "@/lib/docSign";
import { qrSignLengkap, type QrSignSettings } from "@/lib/qrSign";

export type DocSignPayload = {
  doc_type: DocTypeKey;
  slots: SignSlot[];
}[];

// Simpan pengaturan pengesahan semua jenis dokumen sekaligus (Admin saja)
export async function saveDocSignSettings(
  payload: DocSignPayload,
  qr?: QrSignSettings
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
    if (!organizationId) throw new Error("Organisasi tidak terdeteksi");
    if (!isSuperAdmin && profile?.role !== "Admin")
      throw new Error("Hanya Admin yang bisa mengubah pengaturan ini");

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
      })),
      { onConflict: "organization_id,doc_type" }
    );
    if (error) throw new Error(error.message);

    if (qr) {
      // Aturan yang sama dengan di form, ditegakkan lagi di sini: form
      // bisa dilewati, server action tidak.
      if (qr.aktif && !qrSignLengkap(qr))
        throw new Error(
          "Nama & jabatan pengesah wajib diisi sebelum QR Signature bisa diaktifkan."
        );

      const { error: qrError } = await supabase
        .from("organization_settings")
        .upsert(
          {
            organization_id: organizationId,
            qr_sign_aktif: qr.aktif,
            qr_sign_nama: qr.nama.trim() || null,
            qr_sign_jabatan: qr.jabatan.trim() || null,
            qr_sign_instansi: qr.instansi.trim() || null,
          },
          { onConflict: "organization_id" }
        );
      if (qrError) throw new Error(qrError.message);
    }

    revalidatePath("/document-signing");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Gagal menyimpan" };
  }
}
