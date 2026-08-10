/* ============================================================
   Label status satu lot bahan (purchase_batches).

   Judul labelnya TIDAK dikirim lewat query string, tapi diturunkan
   dari `qc_status` lot itu sendiri. Konsekuensinya: satu URL untuk
   seluruh siklus — di gudang mencetak QUARANTINE, sesudah QC memutus
   URL yang sama mencetak RELEASE atau REJECT. Tidak ada jalan untuk
   mencetak "RELEASE" pada lot yang sebenarnya ditolak, dan itu justru
   yang bikin label ini boleh dipercaya.
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import { LabelPage } from "../../LabelKit";
import LabelToolbar from "../../LabelToolbar";
import StatusLabel, { statusKata } from "../../StatusLabel";
import { LOT_SELECT, lotLabelData, stempelCetak, type LotRaw } from "../../lotLabelData";

export default async function PrintLotLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }] = await Promise.all([
    supabase
      .from("purchase_batches")
      .select(LOT_SELECT)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
  ]);

  if (!data) notFound();
  const lot = lotLabelData(data as unknown as LotRaw, stempelCetak());

  return (
    <LabelPage>
      <LabelToolbar label={`Cetak Label ${statusKata(lot.status)}`} />
      <StatusLabel data={lot} org={org?.nama} />
    </LabelPage>
  );
}
