/* ============================================================
   Label status produk jadi (production_batches).

   Statusnya diturunkan dari `qa_status`, dengan pemetaan yang sama
   dengan yang dipakai stok jual: Hold = karantina (belum masuk stok),
   Released = boleh dijual, Rejected = tidak boleh keluar gudang.
   Jadi label yang menempel di palet selalu sama dengan apa yang
   dipercayai sistem, tidak ada kemungkinan barang ber-label RELEASE
   tapi sistemnya masih menahan.

   Satu label PER VARIAN hasil, bukan satu per batch: tiap varian
   adalah tumpukan fisik sendiri dengan jumlah sendiri.

   Kedaluwarsa dibiarkan kosong untuk ditulis tangan, produk jadi
   belum menyimpan masa simpan di mana pun, dan mencetak "-" akan
   terbaca sebagai "tidak punya kedaluwarsa".
   ============================================================ */

import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import { LabelPage, tanggalLabel, waktuCetak } from "../../LabelKit";
import LabelToolbar from "../../LabelToolbar";
import StatusLabel, {
  statusKata,
  statusLabelKey,
  type StatusLabelData,
} from "../../StatusLabel";

type BatchRaw = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  qa_status: string | null;
  qa_oleh: string | null;
  qa_note: string | null;
  production_outputs: {
    qty_hasil: number;
    satuan: string;
    varian_ukuran: string | null;
    products: { kode: string | null; nama_produk: string; brand: string | null } | null;
  }[];
};

export default async function PrintBatchLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }] = await Promise.all([
    supabase
      .from("production_batches")
      .select(
        `id, no_batch_produksi, tanggal_produksi, qa_status, qa_oleh, qa_note,
         production_outputs(qty_hasil, satuan, varian_ukuran,
           products(kode, nama_produk, brand))`
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
  ]);

  if (!data) notFound();
  const batch = data as unknown as BatchRaw;

  const status = statusLabelKey(batch.qa_status);
  const dicetak = waktuCetak();
  const tglProduksi = tanggalLabel(batch.tanggal_produksi);

  // Batch tanpa baris output (mustahil lewat alur normal, tapi mungkin
  // pada data migrasi) tetap dapat satu label, tanpa varian & jumlah.
  const outputs =
    batch.production_outputs.length > 0
      ? batch.production_outputs
      : [{ qty_hasil: 0, satuan: "", varian_ukuran: null, products: null }];

  const labels: StatusLabelData[] = outputs.map((o) => ({
    status,
    namaLabel: "Nama Produk Jadi",
    nama: o.products?.nama_produk || "-",
    kode: o.products?.kode || null,
    noBatch: batch.no_batch_produksi,
    jumlah:
      Number(o.qty_hasil) > 0
        ? `${Number(o.qty_hasil).toLocaleString("id-ID")} ${o.satuan || "pcs"}`
        : null,
    pihakLabel: "Varian / Brand",
    pihak:
      [o.varian_ukuran, o.products?.brand].filter(Boolean).join(" · ") || null,
    expDate: null,
    masukLabel: "Tgl Produksi",
    masuk: tglProduksi,
    catatan: batch.qa_note,
    petugas: batch.qa_oleh,
    jejak: `Batch ${batch.no_batch_produksi} · Dicetak ${dicetak}`,
  }));

  return (
    <LabelPage>
      <LabelToolbar
        label={`Cetak Label ${statusKata(status)}`}
        jumlah={labels.length}
      />
      {labels.map((l, i) => (
        <StatusLabel
          key={i}
          data={l}
          org={org?.nama}
          terakhir={i === labels.length - 1}
        />
      ))}
    </LabelPage>
  );
}
