import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
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
  orderFor,
} from "@/lib/pagination";

type MaterialRow = {
  id: string;
  material_code: string;
  tradename: string;
  origin: string | null;
  noc: string | null;
  kategori: "Bahan Baku" | "Kemasan";
  keterangan: string | null;
  suppliers: { nama: string } | null;
  material_inci: { inci_name: string; percentage: number }[];
};

/** Kemasan dijelaskan lewat keterangan bebas; bahan baku lewat komposisi INCI. */
function inciTeks(m: MaterialRow) {
  if (m.kategori === "Kemasan") return m.keterangan || "-";
  return m.material_inci.length > 0
    ? m.material_inci.map((i) => `${i.inci_name} (${i.percentage}%)`).join(", ")
    : "-";
}

const SORT: Record<string, string> = {
  kode: "material_code",
  tradename: "tradename",
  kategori: "kategori",
  origin: "origin",
  noc: "noc",
};

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  const ord = orderFor(sp, SORT, { column: "material_code", ascending: true });

  let query = supabase
    .from("materials")
    .select(
      "id, material_code, tradename, origin, noc, kategori, keterangan, suppliers(nama), material_inci(inci_name, percentage)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOr(["material_code", "tradename", "origin", "noc"], sp.q)
    );
  if (sp.filter("kategori"))
    query = query.eq("kategori", sp.filter("kategori"));

  const { data: materials, count } = await query
    .order(ord.column, { ascending: ord.ascending })
    .range(sp.from, sp.to);

  const list = (materials || []) as unknown as MaterialRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <BahanShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Materials</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} material terdaftar, data
            regulasi/komposisi bahan baku
          </p>
        </div>
        <Link
          href="/materials/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Tambah Material
        </Link>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari kode / tradename..."
          info={info}
          filters={[
            {
              param: "kategori",
              label: "Semua Kategori",
              options: [
                { value: "Bahan Baku", label: "Bahan Baku" },
                { value: "Kemasan", label: "Kemasan" },
              ],
            },
          ]}
        />
      </div>
      <DataTable
        rows={list}
        rowKey={(m) => m.id}
        minWidth={960}
        empty={
          sp.q || sp.filter("kategori")
            ? "Tidak ada material yang cocok dengan pencarian/filter."
            : "Belum ada material."
        }
        columns={[
          {
            key: "kode",
            header: "Kode",
            sort: "kode",
            role: "subtitle",
            cell: (m) => (
              <span className="font-mono text-[12.5px] font-medium whitespace-nowrap">
                {m.material_code}
              </span>
            ),
          },
          {
            key: "tradename",
            header: "Tradename",
            sort: "tradename",
            role: "title",
            cell: (m) => (
              <div className="max-w-[200px] truncate font-medium" title={m.tradename}>
                {m.tradename}
              </div>
            ),
            cardCell: (m) => m.tradename,
          },
          {
            key: "kategori",
            header: "Kategori",
            sort: "kategori",
            role: "badge",
            cell: (m) => (
              <span
                className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                  m.kategori === "Kemasan"
                    ? "bg-amber-100 text-amber-500"
                    : "bg-botanical-100 text-botanical-700"
                }`}
              >
                {m.kategori}
              </span>
            ),
          },
          {
            key: "supplier",
            header: "Supplier",
            role: "primary",
            cell: (m) => (
              <div className="max-w-[170px] truncate" title={m.suppliers?.nama}>
                {m.suppliers?.nama || "-"}
              </div>
            ),
            cardCell: (m) => m.suppliers?.nama || "-",
          },
          {
            key: "inci",
            header: "INCI / Keterangan",
            role: "secondary",
            cell: (m) => {
              const teks = inciTeks(m);
              return (
                <div
                  className="w-[280px] text-[12px] leading-snug line-clamp-2"
                  title={teks}
                >
                  {teks}
                </div>
              );
            },
            cardCell: (m) => (
              <span className="text-[12px] leading-snug">{inciTeks(m)}</span>
            ),
          },
          {
            key: "origin",
            header: "Origin",
            sort: "origin",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (m) => m.origin || "-",
          },
          {
            key: "noc",
            header: "NOC",
            sort: "noc",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (m) => m.noc || "-",
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (m) => (
              <RowActions>
                <IconAction
                  icon={Pencil}
                  label="Edit material"
                  href={`/materials/${m.id}/edit`}
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