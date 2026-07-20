import { createClient } from "@/lib/supabase/server";
import {
  defaultSlots,
  type DocTypeKey,
  type SignSlot,
  type LegacySettings,
} from "@/lib/docSign";

/**
 * Slot tanda tangan AKTIF untuk satu jenis dokumen — dipakai halaman cetak.
 * Kalau belum pernah diatur, fallback ke 3 key person lama (semua aktif).
 */
export async function getDocSigners(
  organizationId: string,
  docType: DocTypeKey
): Promise<SignSlot[]> {
  const supabase = await createClient();

  const [{ data: row }, { data: legacy }] = await Promise.all([
    supabase
      .from("doc_sign_settings")
      .select("slots")
      .eq("organization_id", organizationId)
      .eq("doc_type", docType)
      .maybeSingle(),
    supabase
      .from("organization_settings")
      .select(
        "sign_dibuat_nama, sign_dibuat_jabatan, sign_disetujui_nama, sign_disetujui_jabatan, sign_mengetahui_nama, sign_mengetahui_jabatan"
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  const slots =
    row?.slots && Array.isArray(row.slots) && row.slots.length > 0
      ? (row.slots as SignSlot[])
      : defaultSlots(legacy as LegacySettings);

  return slots.filter((s) => s.aktif);
}
