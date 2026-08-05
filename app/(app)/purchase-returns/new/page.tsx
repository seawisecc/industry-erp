import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import {
  ilikeOr,
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";
import { sisaHutang } from "@/lib/purchaseReturn";

type FakturRow = {
  id: string;
  no_invoice: string | null;
  tanggal_terima: string;
  supplier_nama: string | null;
  total_invoice: number;
  total_retur: number;
  status_bayar: string;
  purchase_orders: { no_po: string | null } | null;
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

/**
 * Langkah 1 dari 2: pilih faktur penerimaan dulu.
 *
 * Sengaja dua langkah. Batch yang bisa diretur selalu milik satu faktur
 * tertentu, jadi memuat semua faktur BESERTA batch-nya sekaligus berarti
 * mengirim seluruh riwayat pembelian ke browser cuma untuk memilih satu.
 */
export default async function PilihFakturPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  let query = supabase
    .from("receivings")
    .select(
      "id, no_invoice, tanggal_terima, supplier_nama, total_invoice, total_retur, status_bayar, purchase_orders(no_po)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q) query = query.or(ilikeOr(["no_invoice", "supplier_nama"], sp.q));

  const { data, count } = await query
    .order("tanggal_terima", { ascending: false })
    .range(sp.from, sp.to);

  const list = (data || []) as unknown as FakturRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <div>
      <Link
        href="/purchase-returns"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Purchase Return
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Pilih Faktur Penerimaan
      </h1>
      <p className="text-muted text-sm mb-4">
        Retur selalu mengacu ke satu faktur, supaya pengurangan hutangnya jelas
        ke tagihan yang mana.
      </p>

      <TableToolbar
        placeholder="Cari no. faktur / supplier..."
        info={info}
      />

      <DataTable
        rows={list}
        rowKey={(r) => r.id}
        minWidth={820}
        empty={
          sp.q
            ? "Tidak ada faktur yang cocok dengan pencarian."
            : "Belum ada penerimaan barang."
        }
        columns={[
          {
            key: "no",
            header: "No. Faktur",
            role: "subtitle",
            className: "font-mono text-[12px] whitespace-nowrap",
            cell: (r) => r.no_invoice || "(tanpa nomor)",
          },
          {
            key: "supplier",
            header: "Supplier",
            role: "title",
            cell: (r) => r.supplier_nama || "-",
          },
          {
            key: "po",
            header: "No. PO",
            role: "secondary",
            className: "font-mono text-[11.5px] whitespace-nowrap",
            cell: (r) => r.purchase_orders?.no_po || "-",
          },
          {
            key: "tanggal",
            header: "Tgl Terima",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (r) => formatTanggal(r.tanggal_terima),
          },
          {
            key: "total",
            header: "Nilai Faktur",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => formatRupiah(Number(r.total_invoice)),
          },
          {
            key: "retur",
            header: "Sudah Diretur",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) =>
              Number(r.total_retur) > 0 ? (
                <span className="text-clay-600 font-medium">
                  {formatRupiah(Number(r.total_retur))}
                </span>
              ) : (
                <span className="text-muted">-</span>
              ),
          },
          {
            key: "sisa",
            header: "Sisa Tagihan",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap font-semibold",
            cell: (r) =>
              formatRupiah(sisaHutang(Number(r.total_invoice), Number(r.total_retur))),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (r) => (
              <RowActions>
                <IconAction
                  icon={ArrowRight}
                  label="Buat retur dari faktur ini"
                  href={`/purchase-returns/new/${r.id}`}
                  tone="primary"
                />
              </RowActions>
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </div>
  );
}
