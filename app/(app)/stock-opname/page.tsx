import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Eye } from "lucide-react";
import BahanShell from "@/components/BahanShell";
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

type OpnameRow = {
  id: string;
  no_opname: string;
  tanggal: string;
  tanggal_selesai: string | null;
  kategori: string | null;
  status: string;
  catatan: string | null;
  adjustment_id: string | null;
  dibuat_oleh: string | null;
  stock_opname_items: { qty_fisik: number | null }[];
};

function formatTanggal(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function StockOpnamePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  let query = supabase
    .from("stock_opnames")
    .select(
      "id, no_opname, tanggal, tanggal_selesai, kategori, status, catatan, adjustment_id, dibuat_oleh, stock_opname_items(qty_fisik)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q) query = query.or(ilikeOr(["no_opname", "catatan"], sp.q));
  if (sp.filter("status")) query = query.eq("status", sp.filter("status"));

  const [{ data, count }, { data: profiles }] = await Promise.all([
    query.order("tanggal", { ascending: false }).range(sp.from, sp.to),
    supabase
      .from("profiles")
      .select("id, nama")
      .eq("organization_id", organizationId),
  ]);

  const list = (data || []) as unknown as OpnameRow[];
  const info = pageInfo(sp.page, count, list.length);
  const namaOleh = new Map(
    ((profiles || []) as { id: string; nama: string }[]).map((p) => [p.id, p.nama])
  );

  const berjalan = list.find((o) => o.status === "Berjalan");

  return (
    <BahanShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Stock Opname
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} opname · hitung fisik gudang,
            selisihnya jadi adjustment yang terdokumentasi
          </p>
        </div>
        {berjalan ? (
          <Link
            href={`/stock-opname/${berjalan.id}`}
            className="inline-flex items-center gap-1.5 h-9 bg-amber-500 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:opacity-90 transition-opacity shadow-sm whitespace-nowrap"
          >
            Lanjutkan {berjalan.no_opname}
          </Link>
        ) : (
          <Link
            href="/stock-opname/new"
            className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={14} /> Opname Baru
          </Link>
        )}
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari no. opname / catatan..."
          info={info}
          filters={[
            {
              param: "status",
              label: "Semua Status",
              options: [
                { value: "Berjalan", label: "Berjalan" },
                { value: "Selesai", label: "Selesai" },
              ],
            },
          ]}
        />
      </div>

      <DataTable
        rows={list}
        rowKey={(o) => o.id}
        minWidth={880}
        empty={
          sp.q || sp.filter("status")
            ? "Tidak ada opname yang cocok dengan pencarian/filter."
            : "Belum ada stock opname."
        }
        columns={[
          {
            key: "no",
            header: "No. Opname",
            role: "subtitle",
            className: "font-mono text-[12px] whitespace-nowrap",
            cell: (o) => o.no_opname,
          },
          {
            key: "tanggal",
            header: "Tanggal",
            role: "title",
            className: "whitespace-nowrap",
            cell: (o) => formatTanggal(o.tanggal),
          },
          {
            key: "status",
            header: "Status",
            role: "badge",
            cell: (o) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                  o.status === "Berjalan"
                    ? "bg-amber-100 text-amber-500"
                    : "bg-botanical-100 text-botanical-700"
                }`}
              >
                {o.status}
              </span>
            ),
          },
          {
            key: "cakupan",
            header: "Cakupan",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (o) => o.kategori || "Semua item",
          },
          {
            key: "progres",
            header: "Terhitung",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (o) => {
              const total = o.stock_opname_items.length;
              const isi = o.stock_opname_items.filter(
                (i) => i.qty_fisik !== null
              ).length;
              return `${isi}/${total}`;
            },
          },
          {
            key: "selesai",
            header: "Ditutup",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (o) => formatTanggal(o.tanggal_selesai),
          },
          {
            key: "adj",
            header: "Adjustment",
            role: "secondary",
            cell: (o) =>
              o.adjustment_id ? (
                <Link
                  href={`/data-migration/adjustment/${o.adjustment_id}`}
                  className="text-botanical-700 hover:underline whitespace-nowrap"
                >
                  Lihat penyesuaian
                </Link>
              ) : o.status === "Selesai" ? (
                <span className="text-muted whitespace-nowrap">
                  cocok, tanpa penyesuaian
                </span>
              ) : (
                <span className="text-muted">-</span>
              ),
          },
          {
            key: "oleh",
            header: "Oleh",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (o) => (o.dibuat_oleh && namaOleh.get(o.dibuat_oleh)) || "-",
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (o) => (
              <RowActions>
                <IconAction
                  icon={Eye}
                  label="Buka opname"
                  href={`/stock-opname/${o.id}`}
                  tone="primary"
                />
              </RowActions>
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </BahanShell>
  );
}
