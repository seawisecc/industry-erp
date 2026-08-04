import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProdukShell from "@/components/ProdukShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import {
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";
import { ClipboardList, Printer, Eye } from "lucide-react";

type BatchRow = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  qa_status: string;
  qc_produk_selesai: boolean | null;
  qc_produk_tanggal_uji: string | null;
  qc_produk_oleh: string | null;
  production_outputs: {
    qty_hasil: number;
    satuan: string;
    varian_ukuran: string | null;
    products: { kode: string | null; nama_produk: string } | null;
  }[];
};

function formatTanggal(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function QcFinishedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const features = await getFeatures(organizationId!);
  if (!(features.qa && features.qc)) redirect("/products");

  const kolom = `id, no_batch_produksi, tanggal_produksi, qa_status, qc_produk_selesai,
       qc_produk_tanggal_uji, qc_produk_oleh,
       production_outputs(qty_hasil, satuan, varian_ukuran, products(kode, nama_produk))`;

  const sp = parseListQuery(await searchParams);

  let antreanQuery = supabase
    .from("production_batches")
    .select(kolom, { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("qa_status", "Hold")
    .or("qc_produk_selesai.is.null,qc_produk_selesai.eq.false");

  if (sp.q)
    antreanQuery = antreanQuery.ilike("no_batch_produksi", `%${sp.q}%`);

  const [{ data, count }, { data: riwayat }] = await Promise.all([
    antreanQuery.order("tanggal_produksi").range(sp.from, sp.to),
    // Riwayat: semua batch yang sudah pernah diuji QC
    supabase
      .from("production_batches")
      .select(kolom)
      .eq("organization_id", organizationId)
      .eq("qc_produk_selesai", true)
      .order("qc_produk_tanggal_uji", { ascending: false })
      .limit(30),
  ]);

  const list = (data || []) as unknown as BatchRow[];
  const logs = (riwayat || []) as unknown as BatchRow[];
  const info = pageInfo(sp.page, count, list.length);
  const belum = info.total;

  const produkOf = (b: BatchRow) =>
    b.production_outputs?.[0]?.products?.nama_produk || "-";
  const hasilOf = (b: BatchRow) =>
    b.production_outputs
      .map(
        (o) =>
          `${o.varian_ukuran ? `${o.varian_ukuran}: ` : ""}${Number(
            o.qty_hasil
          ).toLocaleString("id-ID")} ${o.satuan}`
      )
      .join(" · ");

  return (
    <ProdukShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          QC Produk Jadi
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          {belum} batch menunggu pengujian, hasil uji dikirim ke QA sebagai
          dasar pelulusan batch.
        </p>
      </div>

      <h3 className="font-display text-[15px] font-semibold text-ink mt-5 mb-2">
        Antrean Pengujian
      </h3>
      <div className="mb-3">
        <TableToolbar placeholder="Cari no. batch..." info={info} />
      </div>
      <DataTable
        rows={list}
        rowKey={(b) => b.id}
        minWidth={720}
        rowClassName={() => "bg-amber-100/20"}
        empty={
          sp.q
            ? "Tidak ada batch yang cocok dengan pencarian."
            : "Tidak ada batch menunggu pengujian 🎉"
        }
        columns={[
          {
            key: "batch",
            header: "No. Batch",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (b) => (
              <span className="font-mono text-[12.5px]">{b.no_batch_produksi}</span>
            ),
          },
          {
            key: "produk",
            header: "Produk",
            role: "title",
            cell: (b) => (
              <div className="font-medium max-w-[190px] truncate" title={produkOf(b)}>
                {produkOf(b)}
              </div>
            ),
            cardCell: (b) => produkOf(b),
          },
          {
            key: "tgl",
            header: "Tgl Produksi",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (b) => formatTanggal(b.tanggal_produksi),
          },
          {
            key: "hasil",
            header: "Hasil",
            role: "primary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (b) => hasilOf(b),
          },
          {
            key: "aksi",
            header: "Lembar Uji",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (b) => (
              <Link
                href={`/qc-finished/${b.id}`}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-botanical-700 text-white text-[12px] font-medium hover:bg-botanical-800 transition-colors"
              >
                <ClipboardList size={13} /> Uji Produk
              </Link>
            ),
          },
        ]}
      />

      <Pagination info={info} />

      {/* ===== Riwayat pengujian produk jadi ===== */}
      <h3 className="font-display text-[15px] font-semibold text-ink mt-6 mb-2">
        Riwayat Pengujian
      </h3>
      <DataTable
        rows={logs}
        rowKey={(b) => b.id}
        minWidth={820}
        empty="Belum ada riwayat pengujian."
        columns={[
          {
            key: "tgluji",
            header: "Tgl Uji",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (b) => formatTanggal(b.qc_produk_tanggal_uji),
          },
          {
            key: "batch",
            header: "No. Batch",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (b) => (
              <span className="font-mono text-[12px]">{b.no_batch_produksi}</span>
            ),
          },
          {
            key: "produk",
            header: "Produk",
            role: "title",
            cell: (b) => (
              <div className="max-w-[190px] truncate" title={produkOf(b)}>
                {produkOf(b)}
              </div>
            ),
            cardCell: (b) => produkOf(b),
          },
          {
            key: "hasil",
            header: "Hasil",
            role: "primary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (b) => hasilOf(b),
          },
          {
            key: "oleh",
            header: "Diuji Oleh",
            role: "secondary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (b) => b.qc_produk_oleh || "-",
          },
          {
            key: "qa",
            header: "Status QA",
            role: "badge",
            cell: (b) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                  b.qa_status === "Released"
                    ? "bg-botanical-100 text-botanical-700"
                    : b.qa_status === "Rejected"
                      ? "bg-clay-100 text-clay-600"
                      : "bg-amber-100 text-amber-500"
                }`}
              >
                {b.qa_status === "Hold" ? "Menunggu QA" : b.qa_status}
              </span>
            ),
          },
          {
            key: "aksi",
            header: "Dokumen",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (b) => (
              <RowActions>
                <IconAction
                  icon={Eye}
                  label="Lihat detail pengujian"
                  href={`/qc-finished/${b.id}`}
                  tone="primary"
                />
                <IconAction
                  icon={Printer}
                  label="Cetak lembar uji produk"
                  href={`/print/qc-produk/${b.id}`}
                />
              </RowActions>
            ),
          },
        ]}
      />
    </ProdukShell>
  );
}
