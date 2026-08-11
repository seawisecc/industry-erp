import { createClient } from "@/lib/supabase/server";
import {
  bacaQrDoc,
  defaultSlots,
  pengesahQr,
  type DocTypeKey,
  type QrSignDoc,
  type SignSlot,
  type LegacySettings,
} from "@/lib/docSign";

export type DocSignConfig = {
  /** Seluruh slot apa adanya, termasuk yang dimatikan */
  slots: SignSlot[];
  qr: QrSignDoc;
  /** Slot yang sah mengesahkan lewat QR, atau null */
  pengesah: SignSlot | null;
};

/**
 * Pengaturan pengesahan satu jenis dokumen.
 *
 * Kalau belum pernah diatur, fallback ke 3 key person lama dari
 * organization_settings (semuanya aktif).
 */
export async function getDocSignConfig(
  organizationId: string,
  docType: DocTypeKey
): Promise<DocSignConfig> {
  const supabase = await createClient();

  const [{ data: row }, { data: legacy }] = await Promise.all([
    supabase
      .from("doc_sign_settings")
      .select("slots, qr_sign")
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

  const qr = bacaQrDoc(row?.qr_sign);
  return { slots, qr, pengesah: pengesahQr(slots, qr) };
}

/**
 * Kolom tanda tangan MANUAL yang harus dicetak pada dokumen ini.
 *
 * Kosong ketika dokumennya disahkan lewat QR, dan itu bukan efek
 * samping melainkan aturannya: dokumen ditandatangani basah ATAU
 * secara elektronik, tidak dua-duanya. Mencetak keduanya berarti
 * meminta orang yang sama mengesahkan hal yang sama dua kali, dan
 * meninggalkan ruang tanda tangan kosong di dokumen yang sebenarnya
 * sudah sah — auditor akan menganggapnya dokumen yang belum selesai.
 *
 * Aturan itu ditegakkan DI SINI, bukan di tiap halaman cetak, supaya
 * halaman cetak berikutnya tidak perlu ingat memeriksanya.
 */
export async function getDocSigners(
  organizationId: string,
  docType: DocTypeKey
): Promise<SignSlot[]> {
  const cfg = await getDocSignConfig(organizationId, docType);
  if (cfg.pengesah) return [];
  return cfg.slots.filter((s) => s.aktif);
}
