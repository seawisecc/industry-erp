import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer, Tags } from "lucide-react";
import CancelTxButton from "@/components/CancelTxButton";
import EditNoBatchButton from "../EditNoBatchButton";
import DataTable from "@/components/DataTable";
import { hitungEstimasiProduksi } from "@/lib/productionEstimate";
import { cancelProduction, updateBatchNoBatch } from "../actions";
import { localTimeStr } from "@/lib/dates";

type BatchDetail = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  status: string;
  catatan: string | null;
  total_cost_bahan: number;
  production_outputs: {
    qty_hasil: number;
    satuan: string;
    varian_ukuran: string | null;
    products: { kode: string | null; nama_produk: string; brand: string | null } | null;
  }[];
  production_components: {
    item_id: string;
    qty_terpakai: number;
    harga_per_unit: number;
    subtotal: number;
    items: { kode: string; nama: string; satuan: string } | null;
    purchase_batches: {
      no_lot_supplier: string | null;
      exp_date: string | null;
      supplier_nama: string | null;
    } | null;
  }[];
};

/* Cara pembuatan: sama persis dengan yang tercetak di batch record.
   Sebelumnya jejak MES (jam mulai, jam selesai, operator, catatan) cuma
   bisa dilihat dengan membuka halaman cetak, padahal itu yang paling
   sering ditanya waktu meninjau satu batch. */
type Step = {
  urutan: number;
  instruksi: string;
  suhu: string | null;
  rpm: string | null;
  durasi: string | null;
};

type StepLog = {
  urutan: number;
  mulai: string | null;
  selesai: string | null;
  oleh: string | null;
  catatan: string | null;
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function ProductionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const canCancel =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_cancel;
  // Membetulkan nomor batch = izin yang sama dengan membuat plan-nya.
  const canPlan =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_plan_production;

  const { data } = await supabase
    .from("production_batches")
    .select(
      `id, no_batch_produksi, tanggal_produksi, status, catatan, total_cost_bahan,
       production_outputs(qty_hasil, satuan, varian_ukuran, products(kode, nama_produk, brand)),
       production_components(item_id, qty_terpakai, harga_per_unit, subtotal, items(kode, nama, satuan), purchase_batches(no_lot_supplier, exp_date, supplier_nama))`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const batch = data as unknown as BatchDetail;
  const out = batch.production_outputs?.[0];

  const totalPcs = batch.production_outputs.reduce(
    (s, o) => s + Number(o.qty_hasil),
    0
  );
  const costPerUnit = totalPcs > 0 ? Number(batch.total_cost_bahan) / totalPcs : 0;

  const estimasi = await hitungEstimasiProduksi(
    organizationId!,
    batch.id,
    batch.production_components,
    Number(batch.total_cost_bahan)
  );

  // Snapshot dari plan adalah jejak historis; prosedur produk yang
  // berlaku sekarang cuma fallback untuk batch lama yang belum punya
  // snapshot. Urutannya sama dengan halaman cetak.
  const { data: plan } = await supabase
    .from("production_plans")
    .select("steps_snapshot, product_id, execution_data")
    .eq("production_batch_id", batch.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  let steps: Step[] = Array.isArray(plan?.steps_snapshot)
    ? (plan!.steps_snapshot as Step[])
    : [];
  if (steps.length === 0 && plan?.product_id) {
    const { data: liveSteps } = await supabase
      .from("product_process_steps")
      .select("urutan, instruksi, suhu, rpm, durasi")
      .eq("product_id", plan.product_id as string)
      .eq("organization_id", organizationId)
      .order("urutan");
    steps = (liveSteps || []) as Step[];
  }
  steps.sort((a, b) => a.urutan - b.urutan);

  const langkahLogs = new Map<number, StepLog>();
  const exec = plan?.execution_data as { langkah?: StepLog[] } | null;
  for (const l of exec?.langkah || []) langkahLogs.set(l.urutan, l);
  const adaJejak = steps.some((s) => langkahLogs.get(s.urutan)?.mulai);

  return (
    <div className="max-w-5xl">
      <Link
        href="/production"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Produksi
      </Link>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">
          <span className="font-mono text-[22px]">{batch.no_batch_produksi}</span>
        </h1>
        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-botanical-100 text-botanical-700">
          {batch.status}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <CancelTxButton
            id={batch.id}
            action={cancelProduction}
            canCancel={canCancel}
            label="Batal Produksi"
            judul="Batalkan Batch Produksi"
            keterangan="Bahan yang terpakai akan dikembalikan ke stok dan hasil produksi dihapus. Hanya bisa bila produk jadinya belum terjual/terkirim."
            redirectTo="/production"
          />
          <EditNoBatchButton
            id={batch.id}
            noSekarang={batch.no_batch_produksi}
            action={updateBatchNoBatch}
            canEdit={canPlan}
            variant="button"
          />
          <Link
            href={`/print/label/batch/${batch.id}`}
            className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <Tags size={14} /> Cetak Label
          </Link>
          <Link
            href={`/print/production/${batch.id}`}
            className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <Printer size={14} /> Cetak Batch Record
          </Link>
        </div>
      </div>
      <p className="text-muted text-sm mb-6">
        {formatTanggal(batch.tanggal_produksi)}
        {batch.catatan ? `, ${batch.catatan}` : ""}
      </p>

      <div className="glass rounded-2xl p-6 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[13.5px]">
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
            Produk
          </div>
          <div className="font-medium">{out?.products?.nama_produk || "-"}</div>
          <div className="text-[12px] text-muted">
            {out?.products?.brand || out?.products?.kode || ""}
          </div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
            Hasil per Ukuran
          </div>
          {batch.production_outputs.map((o, i) => (
            <div key={i} className="font-medium">
              {o.varian_ukuran ? `${o.varian_ukuran}: ` : ""}
              {Number(o.qty_hasil).toLocaleString("id-ID")} {o.satuan}
            </div>
          ))}
        </div>
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
            Cost Bahan / pcs (rata-rata)
          </div>
          <div className="font-medium">{formatRupiah(costPerUnit)}</div>
        </div>
      </div>

      {/* ===== Estimasi awal vs biaya real =====
          Angka real sendirian tidak bisa dibaca: petugas tidak tahu
          wajar atau membeludak. Pembandingnya biaya seandainya semua
          persis rencana, dengan harga lot yang sama. */}
      {estimasi && (
        <div className="glass rounded-2xl p-6 mb-5">
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Estimasi Awal vs Biaya Real
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5 mb-4">
            Estimasi dihitung dari takaran formula &amp; rencana kemasan, dihargai
            dengan harga lot yang sama dipakai batch ini, jadi selisihnya murni soal
            pemakaian dan bukan pergerakan harga.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[13.5px]">
            <div>
              <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
                Estimasi Awal
              </div>
              <div className="font-semibold text-[16px]">
                {formatRupiah(estimasi.total)}
              </div>
              <div className="text-[11.5px] text-muted mt-0.5">
                Bahan {formatRupiah(estimasi.bahan)} · Kemasan{" "}
                {formatRupiah(estimasi.kemasan)}
              </div>
            </div>
            <div>
              <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
                Biaya Real
              </div>
              <div className="font-semibold text-[16px]">
                {formatRupiah(estimasi.real)}
              </div>
              <div className="text-[11.5px] text-muted mt-0.5">
                Timbang nyata + adjusting + kemasan terpakai
              </div>
            </div>
            <div>
              <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
                Selisih
              </div>
              <div
                className={`font-semibold text-[16px] ${
                  estimasi.persen != null && Math.abs(estimasi.persen) < 1
                    ? "text-ink"
                    : estimasi.selisih > 0
                      ? "text-clay-600"
                      : "text-botanical-700"
                }`}
              >
                {estimasi.selisih > 0 ? "+" : estimasi.selisih < 0 ? "−" : ""}
                {formatRupiah(Math.abs(estimasi.selisih))}
                {estimasi.persen != null && (
                  <span className="text-[12.5px] font-normal">
                    {" "}
                    ({estimasi.persen > 0 ? "+" : ""}
                    {estimasi.persen.toLocaleString("id-ID", {
                      maximumFractionDigits: 1,
                    })}
                    %)
                  </span>
                )}
              </div>
              <div className="text-[11.5px] text-muted mt-0.5">
                {estimasi.persen != null && Math.abs(estimasi.persen) < 1
                  ? "Sesuai rencana"
                  : estimasi.selisih > 0
                    ? "Melebihi rencana"
                    : "Lebih hemat dari rencana"}
              </div>
            </div>
          </div>
          {estimasi.tanpaHarga.length > 0 && (
            <p className="text-[11.5px] text-clay-600 mt-4">
              ⚠ Belum ada acuan harga untuk: {estimasi.tanpaHarga.join(", ")}, jadi
              estimasinya lebih rendah dari yang seharusnya.
            </p>
          )}
        </div>
      )}

      <h2 className="font-display text-[15.5px] font-semibold text-ink mb-2">
        Bahan Terpakai (Traceability Lot)
      </h2>
      <div className="mb-5">
        <DataTable
          rows={batch.production_components}
          rowKey={(_c, i) => String(i)}
          minWidth={760}
          empty="Tidak ada bahan tercatat."
          footer={{
            row: (
              <tr className="border-t border-line">
                <td colSpan={5} className="px-4 py-3 text-right font-semibold sticky-col">
                  Total Cost Bahan
                </td>
                <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                  {formatRupiah(Number(batch.total_cost_bahan))}
                </td>
              </tr>
            ),
            card: (
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-muted">Total Cost Bahan</span>
                <span className="font-semibold">
                  {formatRupiah(Number(batch.total_cost_bahan))}
                </span>
              </div>
            ),
          }}
          columns={[
            {
              key: "bahan",
              header: "Bahan",
              role: "title",
              cell: (c) => (
                <>
                  <span className="font-mono text-[11.5px] text-botanical-700 mr-2">
                    {c.items?.kode}
                  </span>
                  {c.items?.nama}
                  {c.purchase_batches?.supplier_nama && (
                    <div className="text-[11.5px] text-muted">
                      {c.purchase_batches.supplier_nama}
                    </div>
                  )}
                </>
              ),
              cardCell: (c) => (
                <>
                  <div>{c.items?.nama}</div>
                  <div className="text-[11.5px] text-muted font-mono font-normal">
                    {c.items?.kode}
                    {c.purchase_batches?.supplier_nama
                      ? ` · ${c.purchase_batches.supplier_nama}`
                      : ""}
                  </div>
                </>
              ),
            },
            {
              key: "lot",
              header: "Lot Supplier",
              role: "primary",
              className: "font-mono text-[12px]",
              cell: (c) => c.purchase_batches?.no_lot_supplier || "-",
            },
            {
              key: "exp",
              header: "Exp",
              cardLabel: "Kedaluwarsa",
              role: "secondary",
              className: "whitespace-nowrap text-[12.5px]",
              cell: (c) =>
                c.purchase_batches?.exp_date
                  ? new Date(
                      c.purchase_batches.exp_date + "T00:00:00"
                    ).toLocaleDateString("id-ID", {
                      month: "short",
                      year: "numeric",
                    })
                  : "-",
            },
            {
              key: "qty",
              header: "Qty",
              cardLabel: "Qty Terpakai",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (c) =>
                `${Number(c.qty_terpakai).toLocaleString("id-ID")} ${c.items?.satuan}`,
            },
            {
              key: "harga",
              header: "Harga/Unit",
              role: "secondary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (c) => formatRupiah(Number(c.harga_per_unit)),
            },
            {
              key: "subtotal",
              header: "Subtotal",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (c) => formatRupiah(Number(c.subtotal)),
            },
          ]}
        />
      </div>

      {steps.length > 0 && (
        <>
          <h2 className="font-display text-[15.5px] font-semibold text-ink mb-0.5">
            Cara Pembuatan
          </h2>
          <p className="text-muted text-[12.5px] mb-2">
            {adaJejak
              ? "Jam mulai & selesai dicatat operator di layar Execution, dalam waktu " +
                "setempat. Isian yang sama ini yang tercetak di batch record."
              : "Langkahnya belum pernah diisi lewat layar Execution, jadi kolom jam " +
                "dan parafnya kosong dan diisi tangan di batch record."}
          </p>
          <div className="mb-5">
            <DataTable
              rows={steps}
              rowKey={(s) => String(s.urutan)}
              minWidth={720}
              empty="Belum ada langkah."
              columns={[
                {
                  key: "no",
                  header: "No",
                  role: "subtitle",
                  className: "font-semibold whitespace-nowrap",
                  cardCell: (s) => `Langkah ${s.urutan}`,
                  cell: (s) => `${s.urutan}.`,
                },
                {
                  key: "instruksi",
                  header: "Instruksi",
                  role: "title",
                  cell: (s) => (
                    <>
                      {s.instruksi}
                      {langkahLogs.get(s.urutan)?.catatan && (
                        <div className="text-[11.5px] text-muted italic mt-0.5">
                          Catatan: {langkahLogs.get(s.urutan)!.catatan}
                        </div>
                      )}
                    </>
                  ),
                },
                {
                  key: "parameter",
                  header: "Parameter",
                  role: "primary",
                  className: "text-[12.5px] text-muted",
                  cell: (s) =>
                    [s.suhu, s.rpm ? `${s.rpm} rpm` : null, s.durasi]
                      .filter(Boolean)
                      .join(" · ") || "-",
                },
                {
                  key: "mulai",
                  header: "Mulai",
                  role: "primary",
                  align: "center",
                  className: "font-mono text-[12.5px] whitespace-nowrap",
                  cell: (s) => localTimeStr(langkahLogs.get(s.urutan)?.mulai) || "-",
                },
                {
                  key: "selesai",
                  header: "Selesai",
                  role: "primary",
                  align: "center",
                  className: "font-mono text-[12.5px] whitespace-nowrap",
                  cell: (s) => localTimeStr(langkahLogs.get(s.urutan)?.selesai) || "-",
                },
                {
                  key: "oleh",
                  header: "Paraf",
                  cardLabel: "Dikerjakan oleh",
                  role: "primary",
                  align: "center",
                  className: "text-[12.5px]",
                  cell: (s) => langkahLogs.get(s.urutan)?.oleh || "-",
                },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
