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
  ilikeOr,
  pageInfo,
  parseListQuery,
  type SearchParams,
  orderFor,
} from "@/lib/pagination";
import { ClipboardList, Printer, FileText, Tags } from "lucide-react";

import { namaBrand } from "@/lib/produkLabel";
type BatchRow = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  qa_status: string;
  qa_note: string | null;
  qa_oleh: string | null;
  qa_tanggal: string | null;
  qc_produk_selesai?: boolean | null;
  production_outputs: {
    qty_hasil: number;
    satuan: string;
    varian_ukuran: string | null;
    products: { kode: string | null; nama_produk: string; brand: string | null } | null;
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

const SORT: Record<string, string> = {
  batch: "no_batch_produksi",
  tgl: "tanggal_produksi",
};

export default async function QaReleasePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const features = await getFeatures(organizationId!);
  if (!(features.qa)) redirect("/products");

  const sp = parseListQuery(await searchParams);

  const ord = orderFor(sp, SORT, { column: "tanggal_produksi", ascending: true });

  let holdQuery = supabase
    .from("production_batches")
    .select(
      `id, no_batch_produksi, tanggal_produksi, qa_status, qa_note, qa_oleh, qa_tanggal,
         qc_produk_selesai,
         production_outputs(qty_hasil, satuan, varian_ukuran, products(kode, nama_produk, brand))`,
      { count: "exact" }
    )
    .eq("organization_id", organizationId)
    .eq("qa_status", "Hold");

  if (sp.q) holdQuery = holdQuery.or(ilikeOr(["no_batch_produksi"], sp.q));

  const [{ data: hold, count }, { data: history }] = await Promise.all([
    holdQuery
      .order(ord.column, { ascending: ord.ascending })
      .range(sp.from, sp.to),
    supabase
      .from("production_batches")
      .select(
        `id, no_batch_produksi, tanggal_produksi, qa_status, qa_note, qa_oleh, qa_tanggal,
         production_outputs(qty_hasil, satuan, varian_ukuran, products(kode, nama_produk, brand))`
      )
      .eq("organization_id", organizationId)
      .in("qa_status", ["Released", "Rejected"])
      .not("qa_tanggal", "is", null)
      .order("qa_tanggal", { ascending: false })
      .limit(15),
  ]);

  const list = (hold || []) as unknown as BatchRow[];
  const logs = (history || []) as unknown as BatchRow[];
  const info = pageInfo(sp.page, count, list.length);

  // Brand ikut: satu pabrik maklon mengerjakan produk bernama mirip untuk
  // brand berbeda, dan batch yang tertukar baru ketahuan setelah diluluskan.
  const produkOf = (b: BatchRow) => {
    const p = b.production_outputs?.[0]?.products;
    return p ? namaBrand(p.nama_produk, p.brand) : "-";
  };
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
          QA Release
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          {list.length} batch menunggu review, produk jadi belum masuk stok jual
          sampai batch di-release QA.
        </p>
      </div>

      <div className="mt-4">
        <TableToolbar placeholder="Cari no. batch..." info={info} />
      </div>
      <DataTable
        rows={list}
        rowKey={(b) => b.id}
        minWidth={820}
        rowClassName={() => "bg-amber-100/20"}
        empty={
          sp.q
            ? "Tidak ada batch yang cocok dengan pencarian."
            : "Tidak ada batch menunggu review 🎉, batch baru dari Production akan muncul di sini."
        }
        columns={[
          {
            key: "batch",
            header: "No. Batch",
            sort: "batch",
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
              <div className="font-medium max-w-[200px] truncate" title={produkOf(b)}>
                {produkOf(b)}
              </div>
            ),
            cardCell: (b) => produkOf(b),
          },
          {
            key: "tgl",
            header: "Tgl Produksi",
            sort: "tgl",
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
            key: "qc",
            header: "Uji QC",
            role: "badge",
            className: "whitespace-nowrap",
            cell: (b) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  b.qc_produk_selesai
                    ? "bg-botanical-100 text-botanical-700"
                    : "bg-amber-100 text-amber-500"
                }`}
              >
                {b.qc_produk_selesai ? "Selesai" : "Menunggu QC"}
              </span>
            ),
          },
          {
            key: "aksi",
            header: "Aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (b) => (
              <RowActions>
                <IconAction
                  icon={Tags}
                  label="Cetak label karantina"
                  href={`/print/label/batch/${b.id}`}
                />
                <Link
                  href={`/qa-release/${b.id}`}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-botanical-700 text-white text-[12px] font-medium hover:bg-botanical-800 transition-colors"
                >
                  <ClipboardList size={13} /> Tinjau &amp; Luluskan
                </Link>
              </RowActions>
            ),
          },
        ]}
      />

      <Pagination info={info} />

      {/* ===== Riwayat keputusan QA ===== */}
      <h3 className="font-display text-[15px] font-semibold text-ink mt-6 mb-2">
        Riwayat Keputusan QA{" "}
        <span className="font-sans text-[12px] font-normal text-muted">
          · 15 terakhir
        </span>
      </h3>
      <DataTable
        rows={logs}
        rowKey={(b) => b.id}
        minWidth={720}
        empty="Belum ada riwayat."
        columns={[
          {
            key: "tanggal",
            header: "Tanggal",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (b) => formatTanggal(b.qa_tanggal),
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
              <div className="max-w-[180px] truncate" title={produkOf(b)}>
                {produkOf(b)}
              </div>
            ),
            cardCell: (b) => produkOf(b),
          },
          {
            key: "keputusan",
            header: "Keputusan",
            role: "badge",
            cell: (b) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                  b.qa_status === "Released"
                    ? "bg-botanical-100 text-botanical-700"
                    : "bg-clay-100 text-clay-600"
                }`}
              >
                {b.qa_status}
              </span>
            ),
          },
          {
            key: "oleh",
            header: "Oleh",
            cardLabel: "Diputuskan oleh",
            role: "primary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (b) => b.qa_oleh || "-",
          },
          {
            key: "catatan",
            header: "Catatan",
            role: "secondary",
            cell: (b) => (
              <div
                className="max-w-[220px] line-clamp-2 text-[12.5px]"
                title={b.qa_note || undefined}
              >
                {b.qa_note || "-"}
              </div>
            ),
            cardCell: (b) => (
              <span className="text-[12.5px]">{b.qa_note || "-"}</span>
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
                  icon={FileText}
                  label="Cetak batch record"
                  href={`/print/production/${b.id}`}
                  tone="primary"
                />
                <IconAction
                  icon={Printer}
                  label="Cetak CoA"
                  href={`/print/qa/${b.id}`}
                />
                <IconAction
                  icon={Tags}
                  label={
                    b.qa_status === "Released"
                      ? "Cetak label release"
                      : "Cetak label reject"
                  }
                  href={`/print/label/batch/${b.id}`}
                />
              </RowActions>
            ),
          },
        ]}
      />
    </ProdukShell>
  );
}
