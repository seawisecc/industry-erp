import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Printer } from "lucide-react";
import SalesShell from "@/components/SalesShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import CancelTxButton from "@/components/CancelTxButton";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import { cancelInvoice } from "./actions";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";

type InvRow = {
  id: string;
  no_invoice: string | null;
  tipe: string;
  sumber: string;
  tanggal: string;
  total: number;
  pakai_tax: boolean;
  tax_mode: string | null;
  diskon_percent: number;
  status_bayar: string;
  nama_pembeli: string | null;
  clients: { company_brand: string } | null;
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}
function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function SalesInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const canCancel =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_cancel;

  const sp = parseListQuery(await searchParams);

  // Nama client ada di tabel lain, jadi dicari dulu id-nya. Cara ini
  // (bukan !inner join) menjaga invoice walk-in yang client_id-nya
  // null tetap ikut tercari lewat nama_pembeli.
  let clientIds: string[] = [];
  if (sp.q) {
    const { data: cs } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("company_brand", `%${sp.q}%`)
      .limit(500);
    clientIds = (cs || []).map((c) => c.id as string);
  }

  let query = supabase
    .from("sales_invoices")
    .select(
      "id, no_invoice, tipe, sumber, tanggal, total, pakai_tax, tax_mode, diskon_percent, status_bayar, nama_pembeli, clients(company_brand)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(
        ["no_invoice", "nama_pembeli"],
        sp.q,
        "client_id",
        clientIds
      )
    );
  if (sp.filter("tipe")) query = query.eq("tipe", sp.filter("tipe"));
  if (sp.filter("status"))
    query = query.eq("status_bayar", sp.filter("status"));

  const { data: invoices, count } = await query
    .order("created_at", { ascending: false })
    .range(sp.from, sp.to);

  const list = (invoices || []) as unknown as InvRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <SalesShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Invoices</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} dokumen, proforma &amp;
            invoice, dengan/tanpa tax
          </p>
        </div>
        <Link
          href="/sales-invoices/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Buat Proforma / Invoice
        </Link>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari no. invoice / pembeli..."
          info={info}
          filters={[
            {
              param: "tipe",
              label: "Semua Tipe",
              options: [
                { value: "Proforma", label: "Proforma" },
                { value: "Invoice", label: "Invoice" },
              ],
            },
            {
              param: "status",
              label: "Semua Status",
              options: [
                { value: "Lunas", label: "Lunas" },
                { value: "Belum Lunas", label: "Belum Lunas" },
              ],
            },
          ]}
        />
      </div>
      <DataTable
        rows={list}
        rowKey={(inv) => inv.id}
        minWidth={880}
        empty={
          sp.q || sp.filter("tipe") || sp.filter("status")
            ? "Tidak ada dokumen yang cocok dengan pencarian/filter."
            : "Belum ada dokumen penjualan."
        }
        columns={[
          {
            key: "no",
            header: "No.",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (inv) => (
              <span className="font-mono text-[12px]">{inv.no_invoice}</span>
            ),
          },
          {
            key: "tipe",
            header: "Tipe",
            role: "badge",
            cell: (inv) => (
              <span
                className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  inv.tipe === "Invoice"
                    ? "bg-botanical-100 text-botanical-700"
                    : "bg-amber-100 text-amber-500"
                }`}
              >
                {inv.tipe}
              </span>
            ),
          },
          {
            key: "client",
            header: "Client",
            role: "title",
            cell: (inv) => (
              <div className="max-w-[180px] truncate font-medium">
                {inv.clients?.company_brand || inv.nama_pembeli || "-"}
              </div>
            ),
            cardCell: (inv) =>
              inv.clients?.company_brand || inv.nama_pembeli || "-",
          },
          {
            key: "sumber",
            header: "Sumber",
            role: "secondary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (inv) => inv.sumber,
          },
          {
            key: "tanggal",
            header: "Tanggal",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (inv) => formatTanggal(inv.tanggal),
          },
          {
            key: "total",
            header: "Total",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (inv) => (
              <>
                {formatRupiah(Number(inv.total))}
                {Number(inv.diskon_percent) > 0 && (
                  <div className="text-[10.5px] text-muted">
                    disc {Number(inv.diskon_percent)}%
                  </div>
                )}
              </>
            ),
          },
          {
            key: "tax",
            header: "Tax",
            role: "secondary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (inv) =>
              inv.pakai_tax
                ? inv.tax_mode === "Include"
                  ? "PPN incl."
                  : "PPN"
                : "Non-Tax",
          },
          {
            key: "bayar",
            header: "Bayar",
            role: "badge",
            cell: (inv) => (
              <span
                className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  inv.status_bayar === "Lunas"
                    ? "bg-botanical-100 text-botanical-700"
                    : "bg-amber-100 text-amber-500"
                }`}
              >
                {inv.status_bayar}
              </span>
            ),
          },
          {
            key: "aksi",
            header: "Aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (inv) => (
              <RowActions>
                {canCancel && (
                  <CancelTxButton
                    id={inv.id}
                    action={cancelInvoice}
                    canCancel={canCancel}
                    variant="icon"
                    label="Batalkan dokumen"
                    judul="Batalkan Dokumen Penjualan"
                    keterangan={
                      inv.sumber === "Konsinyasi"
                        ? "Dokumen dihapus dan qty-nya kembali jadi sisa di outlet asalnya. Kalau pengirimannya sudah ditutup, qty itu dicatat sebagai retur dan stok produk jadi bertambah. Tidak bisa bila client sudah membayar."
                        : "Dokumen dihapus dan stok produk jadi kembali. Tidak bisa bila client sudah membayar."
                    }
                  />
                )}
                <IconAction
                  icon={Printer}
                  label="Cetak faktur"
                  href={`/print/invoice/${inv.id}`}
                  tone="primary"
                />
              </RowActions>
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </SalesShell>
  );
}
