import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import SettingsShell from "@/components/SettingsShell";
import {
  DOC_TYPES,
  bacaQrDoc,
  defaultSlots,
  type DocTypeKey,
  type SignSlot,
} from "@/lib/docSign";
import DocSignForm, { DocSignInitial, QrSignInitial } from "./DocSignForm";

export default async function DocumentSigningPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: rows }, { data: legacy }] = await Promise.all([
    supabase
      .from("doc_sign_settings")
      .select("doc_type, slots, qr_sign")
      .eq("organization_id", organizationId),
    supabase
      .from("organization_settings")
      .select(
        "sign_dibuat_nama, sign_dibuat_jabatan, sign_disetujui_nama, sign_disetujui_jabatan, sign_mengetahui_nama, sign_mengetahui_jabatan"
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  const saved = new Map(
    (
      (rows || []) as {
        doc_type: string;
        slots: SignSlot[];
        qr_sign: unknown;
      }[]
    ).map((r) => [r.doc_type, r])
  );

  const initial = {} as DocSignInitial;
  const qrAwal = {} as QrSignInitial;
  for (const d of DOC_TYPES) {
    const row = saved.get(d.key);
    initial[d.key as DocTypeKey] =
      row?.slots && Array.isArray(row.slots) && row.slots.length > 0
        ? row.slots
        : defaultSlots(legacy);
    qrAwal[d.key as DocTypeKey] = bacaQrDoc(row?.qr_sign);
  }

  return (
    <SettingsShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Document Signing
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Atur kolom tanda tangan per jenis dokumen cetak, centang hanya yang
          dipakai perusahaan Anda. Kolom yang tidak dicentang tidak akan muncul
          saat dokumen dicetak.
        </p>
      </div>

      <div className="mt-4">
        <DocSignForm initial={initial} qrAwal={qrAwal} />
      </div>
    </SettingsShell>
  );
}
