import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Printer, Eye } from "lucide-react";
import PembelianShell from "@/components/PembelianShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
  orderFor,
} from "@/lib/pagination";

type ReceivingRow = {
  id: string;
  tanggal_terima: string;
  no_invoice: string | null;
  supplier_nama: string | null;
  total_invoice: number;
  purchase_orders: { no_po: string | null } | null;
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
  tanggal: "tanggal_terima",
  invoice: "no_invoice",
  supplier: "supplier_nama",
  total: "total_invoice",
};

export default async function ReceivingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  const ord = orderFor(sp, SORT, { column: "created_at", ascending: false });

  // No. PO ada di tabel purchase_orders, jadi dicari id-nya dulu.
  let poIds: string[] = [];
  if (sp.q) {
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("no_po", `%${sp.q}%`)
      .limit(500);
    poIds = (pos || []).map((p) => p.id as string);
  }

  let query = supabase
    .from("receivings")
    .select(
      "id, tanggal_terima, no_invoice, supplier_nama, total_invoice, purchase_orders(no_po)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(["no_invoice", "supplier_nama"], sp.q, "po_id", poIds)
    );

  const { data: receivings, count } = await query
    .order(ord.column, { ascending: ord.ascending })
    .range(sp.from, sp.to);

  const list = (receivings || []) as unknown as ReceivingRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <PembelianShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Receiving</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} penerimaan, stok bertambah
            lewat halaman ini
          </p>
        </div>
        <Link
          href="/receivings/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Terima Barang
        </Link>
      </div>

      <div className="mt-4">

        <TableToolbar placeholder="Cari no. PO / supplier..." info={info} />

      </div>
      <DataTable
        rows={list}
        rowKey={(r) => r.id}
        minWidth={760}
        empty={
          sp.q
            ? "Tidak ada penerimaan yang cocok dengan pencarian."
            : "Belum ada penerimaan barang."
        }
        columns={[
          {
            key: "tanggal",
            header: "Tanggal",
            sort: "tanggal",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (r) => formatTanggal(r.tanggal_terima),
          },
          {
            key: "po",
            header: "No. PO",
            role: "primary",
            cell: (r) => (
              <span className="font-mono text-[12.5px]">
                {r.purchase_orders?.no_po || "-"}
              </span>
            ),
          },
          {
            key: "invoice",
            header: "No. Invoice",
            sort: "invoice",
            role: "primary",
            cell: (r) => (
              <span className="font-mono text-[12.5px]">{r.no_invoice || "-"}</span>
            ),
          },
          {
            key: "supplier",
            header: "Supplier",
            sort: "supplier",
            role: "title",
            cell: (r) => (
              <div className="max-w-[220px] truncate font-medium">
                {r.supplier_nama || "-"}
              </div>
            ),
            cardCell: (r) => r.supplier_nama || "-",
          },
          {
            key: "total",
            header: "Total Invoice",
            sort: "total",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => formatRupiah(Number(r.total_invoice)),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => (
              <RowActions>
                <IconAction
                  icon={Printer}
                  label="Cetak bukti terima"
                  href={`/print/receiving/${r.id}`}
                />
                <IconAction
                  icon={Eye}
                  label="Lihat detail penerimaan"
                  href={`/receivings/${r.id}`}
                  tone="primary"
                />
              </RowActions>
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </PembelianShell>
  );
}
