/* ============================================================
   Label status untuk SELURUH lot dalam satu penerimaan.

   Satu faktur bisa berisi belasan item, dan tiap lot fisik butuh
   labelnya sendiri. Mencetaknya satu per satu dari layar detail
   berarti belasan kali bolak-balik, jadi halaman ini merangkai
   semuanya sebagai halaman-halaman terpisah dalam satu perintah
   cetak, printer thermal memotong di antara tiap label.
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import { LabelPage } from "../../LabelKit";
import LabelToolbar from "../../LabelToolbar";
import StatusLabel from "../../StatusLabel";
import { LOT_SELECT, lotLabelData, stempelCetak, type LotRaw } from "../../lotLabelData";

export default async function PrintReceivingLabelsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data: rcv }, { data: org }] = await Promise.all([
    supabase
      .from("receivings")
      .select("id, no_invoice, tanggal_terima, po_id")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
  ]);

  if (!rcv) notFound();

  // Batch milik penerimaan ini. Data lama belum punya receiving_id,
  // jatuhkan ke pasangan po + tanggal seperti di layar detailnya.
  let { data: batches } = await supabase
    .from("purchase_batches")
    .select(LOT_SELECT)
    .eq("receiving_id", id)
    .eq("organization_id", organizationId)
    .order("id");

  if (!batches || batches.length === 0) {
    const fallback = await supabase
      .from("purchase_batches")
      .select(LOT_SELECT)
      .eq("po_id", rcv.po_id)
      .eq("tanggal_terima", rcv.tanggal_terima)
      .eq("organization_id", organizationId)
      .order("id");
    batches = fallback.data;
  }

  const dicetak = stempelCetak();
  const lots = ((batches || []) as unknown as LotRaw[]).map((b) =>
    lotLabelData(b, dicetak)
  );

  return (
    <LabelPage>
      <LabelToolbar label="Cetak Semua Label" jumlah={lots.length} />
      {lots.length === 0 ? (
        <p className="text-center text-muted text-sm py-10 print:hidden">
          Tidak ada lot pada penerimaan ini, jadi tidak ada label yang bisa dicetak.
        </p>
      ) : (
        lots.map((lot, i) => (
          <StatusLabel
            key={i}
            data={lot}
            org={org?.nama}
            terakhir={i === lots.length - 1}
          />
        ))
      )}
    </LabelPage>
  );
}
