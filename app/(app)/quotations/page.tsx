import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Eye, Plus, Printer } from "lucide-react";
import SalesShell from "@/components/SalesShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import { localDateStr } from "@/lib/dates";
import { kedaluwarsa, klasStatusQuotation, STATUS_QUOTATION } from "@/lib/quotation";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
  orderFor,
} from "@/lib/pagination";

type QuoRow = {
  id: string;
  no_quotation: string;
  perihal: string | null;
  tanggal: string;
  berlaku_sampai: string | null;
  status: string;
  total: number;
  nama_penerima: string | null;
  clients: { company_brand: string } | null;
  sales_invoices: { no_invoice: string | null } | null;
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

const SORT: Record<string, string> = {
  no: "no_quotation",
  tanggal: "tanggal",
  berlaku: "berlaku_sampai",
  total: "total",
};

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const sp = parseListQuery(await searchParams);
  const ord = orderFor(sp, SORT, { column: "created_at", ascending: false });
  const hariIni = localDateStr();

  // Nama client ada di tabel lain, jadi dicari dulu id-nya. Quotation
  // untuk calon client (client_id null) tetap tercari lewat nama_penerima.
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
    .from("quotations")
    .select(
      "id, no_quotation, perihal, tanggal, berlaku_sampai, status, total, nama_penerima, clients(company_brand), sales_invoices(no_invoice)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(
        ["no_quotation", "nama_penerima", "perihal"],
        sp.q,
        "client_id",
        clientIds
      )
    );
  const fStatus = sp.filter("status");
  if (fStatus === "Kedaluwarsa") {
    query = query.in("status", ["Draft", "Terkirim"]).lt("berlaku_sampai", hariIni);
  } else if (fStatus) {
    query = query.eq("status", fStatus);
  }

  const { data, count } = await query
    .order(ord.column, { ascending: ord.ascending, nullsFirst: false })
    .order("no_quotation", { ascending: false })
    .range(sp.from, sp.to);

  const list = (data || []) as unknown as QuoRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <SalesShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Quotations</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} penawaran harga, bisa
            diterbitkan jadi Proforma
          </p>
        </div>
        <Link
          href="/quotations/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Buat Quotation
        </Link>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari no. quotation / penerima / perihal..."
          info={info}
          filters={[
            {
              param: "status",
              label: "Semua Status",
              options: [
                ...STATUS_QUOTATION.map((s) => ({ value: s, label: s })),
                { value: "Kedaluwarsa", label: "Kedaluwarsa" },
              ],
            },
          ]}
        />
      </div>
      <DataTable
        rows={list}
        rowKey={(q) => q.id}
        minWidth={900}
        empty={
          sp.q || fStatus
            ? "Tidak ada quotation yang cocok dengan pencarian/filter."
            : "Belum ada quotation."
        }
        columns={[
          {
            key: "no",
            header: "No.",
            sort: "no",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (q) => (
              <Link
                href={`/quotations/${q.id}`}
                className="font-mono text-[12px] hover:text-botanical-700 hover:underline"
              >
                {q.no_quotation}
              </Link>
            ),
          },
          {
            key: "kepada",
            header: "Kepada",
            role: "title",
            cell: (q) => (
              <div className="max-w-[200px] truncate font-medium">
                {q.clients?.company_brand || q.nama_penerima || "-"}
              </div>
            ),
            cardCell: (q) => q.clients?.company_brand || q.nama_penerima || "-",
          },
          {
            key: "perihal",
            header: "Perihal",
            role: "primary",
            cell: (q) => (
              <div className="max-w-[220px] truncate text-[12.5px]">
                {q.perihal || "-"}
              </div>
            ),
            cardCell: (q) => q.perihal || "-",
          },
          {
            key: "tanggal",
            header: "Tanggal",
            sort: "tanggal",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (q) => formatTanggal(q.tanggal),
          },
          {
            key: "berlaku",
            header: "Berlaku s/d",
            sort: "berlaku",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (q) => (q.berlaku_sampai ? formatTanggal(q.berlaku_sampai) : "-"),
          },
          {
            key: "total",
            header: "Total",
            sort: "total",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (q) => formatRupiah(Number(q.total)),
          },
          {
            key: "status",
            header: "Status",
            role: "badge",
            cell: (q) => {
              const lewat = kedaluwarsa(q.status, q.berlaku_sampai, hariIni);
              return (
                <span
                  className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium ${klasStatusQuotation(
                    q.status,
                    lewat
                  )}`}
                >
                  {lewat ? "Kedaluwarsa" : q.status}
                </span>
              );
            },
          },
          {
            key: "proforma",
            header: "Proforma",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (q) =>
              q.sales_invoices?.no_invoice ? (
                <span className="font-mono text-[12px]">
                  {q.sales_invoices.no_invoice}
                </span>
              ) : (
                <span className="text-muted">-</span>
              ),
          },
          {
            key: "aksi",
            header: "Aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (q) => (
              <RowActions>
                <IconAction icon={Eye} label="Lihat detail" href={`/quotations/${q.id}`} />
                <IconAction
                  icon={Printer}
                  label="Cetak quotation"
                  href={`/print/quotation/${q.id}`}
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
