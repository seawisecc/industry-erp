import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Eye } from "lucide-react";
import PembelianShell from "@/components/PembelianShell";
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
import { ALASAN_RETUR } from "@/lib/purchaseReturn";
import AlasanBadge from "./AlasanBadge";

type ReturRow = {
  id: string;
  no_retur: string;
  tanggal: string;
  supplier_nama: string | null;
  alasan: string;
  catatan: string | null;
  total_nilai: number;
  receivings: { no_invoice: string | null } | null;
  purchase_return_items: { item_id: string }[];
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

export default async function PurchaseReturnsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  let query = supabase
    .from("purchase_returns")
    .select(
      "id, no_retur, tanggal, supplier_nama, alasan, catatan, total_nilai, receivings(no_invoice), purchase_return_items(item_id)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(ilikeOr(["no_retur", "supplier_nama", "catatan"], sp.q));
  if (sp.filter("alasan")) query = query.eq("alasan", sp.filter("alasan"));

  const { data, count } = await query
    .order("tanggal", { ascending: false })
    .range(sp.from, sp.to);

  const list = (data || []) as unknown as ReturRow[];
  const info = pageInfo(sp.page, count, list.length);

  // Total nilai retur seluruh periode, bukan cuma halaman ini
  const { data: semua } = await supabase
    .from("purchase_returns")
    .select("total_nilai")
    .eq("organization_id", organizationId);
  const totalNilai = ((semua || []) as { total_nilai: number }[]).reduce(
    (s, r) => s + Number(r.total_nilai),
    0
  );

  return (
    <PembelianShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Purchase Return
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} dokumen · total{" "}
            {formatRupiah(totalNilai)} dipotong dari tagihan supplier
          </p>
        </div>
        <Link
          href="/purchase-returns/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={14} /> Retur Baru
        </Link>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari no. retur / supplier / catatan..."
          info={info}
          filters={[
            {
              param: "alasan",
              label: "Semua Alasan",
              options: ALASAN_RETUR.map((a) => ({ value: a, label: a })),
            },
          ]}
        />
      </div>

      <DataTable
        rows={list}
        rowKey={(r) => r.id}
        minWidth={860}
        empty={
          sp.q || sp.filter("alasan")
            ? "Tidak ada retur yang cocok dengan pencarian/filter."
            : "Belum ada retur pembelian."
        }
        columns={[
          {
            key: "no",
            header: "No. Retur",
            role: "subtitle",
            className: "font-mono text-[12px] whitespace-nowrap",
            cell: (r) => r.no_retur,
          },
          {
            key: "supplier",
            header: "Supplier",
            role: "title",
            cell: (r) => r.supplier_nama || "-",
          },
          {
            key: "alasan",
            header: "Alasan",
            role: "badge",
            cell: (r) => <AlasanBadge alasan={r.alasan} />,
          },
          {
            key: "tanggal",
            header: "Tanggal",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (r) => formatTanggal(r.tanggal),
          },
          {
            key: "faktur",
            header: "Faktur",
            role: "primary",
            className: "font-mono text-[11.5px] whitespace-nowrap",
            cell: (r) => r.receivings?.no_invoice || "-",
          },
          {
            key: "barang",
            header: "Barang",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) =>
              `${new Set(r.purchase_return_items.map((i) => i.item_id)).size} item`,
          },
          {
            key: "nilai",
            header: "Nilai Retur",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap font-semibold",
            cell: (r) => formatRupiah(Number(r.total_nilai)),
          },
          {
            key: "catatan",
            header: "Catatan",
            role: "secondary",
            cell: (r) => (
              <div className="max-w-[200px] truncate">{r.catatan || "-"}</div>
            ),
            cardCell: (r) => r.catatan || "-",
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (r) => (
              <RowActions>
                <IconAction
                  icon={Eye}
                  label="Lihat detail retur"
                  href={`/purchase-returns/${r.id}`}
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
