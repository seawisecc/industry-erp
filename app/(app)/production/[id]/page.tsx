import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer, Tags } from "lucide-react";
import CancelTxButton from "@/components/CancelTxButton";
import DataTable from "@/components/DataTable";
import { hitungEstimasiProduksi } from "@/lib/productionEstimate";
import { cancelProduction } from "../actions";

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
            dengan harga lot yang sama dipakai batch ini — jadi selisihnya murni
            soal pemakaian, bukan pergerakan harga.
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
              ⚠ Belum ada acuan harga untuk: {estimasi.tanpaHarga.join(", ")} —
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
    </div>
  );
}
