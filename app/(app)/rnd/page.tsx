import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Eye, FlaskConical, Coins } from "lucide-react";
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
import { RND_STATUS, klasStatusRnd, labelRevisi } from "@/lib/rnd";

type FormulaRow = {
  id: string;
  no_formula: string;
  revisi: number;
  nama_produk: string;
  brand: string | null;
  tanggal_develop: string;
  status: string;
  clients: { company_brand: string } | null;
  rnd_formula_items: { item_id: string }[];
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const SORT: Record<string, string> = {
  no: "no_formula",
  nama: "nama_produk",
  tanggal: "tanggal_develop",
  status: "status",
};

export default async function RndPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);
  const ord = orderFor(sp, SORT, {
    column: "tanggal_develop",
    ascending: false,
  });

  let query = supabase
    .from("rnd_formulas")
    .select(
      "id, no_formula, revisi, nama_produk, brand, tanggal_develop, status, clients(company_brand), rnd_formula_items(item_id)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(ilikeOr(["no_formula", "nama_produk", "brand"], sp.q));
  if (sp.filter("status")) query = query.eq("status", sp.filter("status"));

  const { data, count } = await query
    .order(ord.column, { ascending: ord.ascending, nullsFirst: false })
    .range(sp.from, sp.to);

  const list = (data || []) as unknown as FormulaRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            R&amp;D Formulation
          </h1>
          <p className="text-muted text-sm mt-1">
            {info.total.toLocaleString("id-ID")} formula · develop, uji di lab,
            revisi, sampai formulanya diputuskan
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/rnd/ppic"
            className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <Coins size={14} /> PPIC R&amp;D
          </Link>
          <Link
            href="/rnd/new"
            className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={14} /> Develop Baru
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <TableToolbar
          placeholder="Cari nomor / nama produk / brand..."
          info={info}
          filters={[
            {
              param: "status",
              label: "Semua Status",
              options: RND_STATUS.map((s) => ({ value: s, label: s })),
            },
          ]}
        />
      </div>

      <DataTable
        rows={list}
        rowKey={(r) => r.id}
        minWidth={900}
        // Formula yang berlaku harus kelihatan tanpa dibaca satu per
        // satu: itu satu-satunya baris yang boleh diturunkan ke produksi.
        rowClassName={(r) => (r.status === "Disetujui" ? "bg-botanical-100/40" : "")}
        empty={
          sp.q || sp.filter("status")
            ? "Tidak ada formula yang cocok dengan pencarian/filter."
            : "Belum ada formula. Mulai dari Develop Baru."
        }
        columns={[
          {
            key: "no",
            header: "No. Formula",
            sort: "no",
            role: "subtitle",
            className: "font-mono text-[12px] whitespace-nowrap",
            cell: (r) => r.no_formula,
          },
          {
            key: "nama",
            header: "Nama Produk",
            sort: "nama",
            role: "title",
            cell: (r) => (
              <div className="min-w-0">
                <div className="truncate">{r.nama_produk}</div>
                {r.brand && (
                  <div className="text-muted text-[11.5px] truncate">
                    {r.brand}
                  </div>
                )}
              </div>
            ),
            cardCell: (r) => (r.brand ? `${r.nama_produk} · ${r.brand}` : r.nama_produk),
          },
          {
            key: "status",
            header: "Status",
            sort: "status",
            role: "badge",
            cell: (r) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium whitespace-nowrap ${klasStatusRnd(
                  r.status
                )}`}
              >
                {r.status}
              </span>
            ),
          },
          {
            key: "versi",
            header: "Versi",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (r) => labelRevisi(r.revisi),
          },
          {
            key: "bahan",
            header: "Bahan",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => `${r.rnd_formula_items.length} bahan`,
          },
          {
            key: "tanggal",
            header: "Tanggal Develop",
            sort: "tanggal",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (r) => formatTanggal(r.tanggal_develop),
          },
          {
            key: "client",
            header: "Client",
            role: "secondary",
            cell: (r) => (
              <div className="max-w-[200px] truncate">
                {r.clients?.company_brand || "-"}
              </div>
            ),
            cardCell: (r) => r.clients?.company_brand || "-",
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (r) => (
              <RowActions>
                <IconAction
                  icon={Eye}
                  label="Lihat detail formula"
                  href={`/rnd/${r.id}`}
                  tone="primary"
                />
                <IconAction
                  icon={FlaskConical}
                  label="Lembar kerja lab"
                  href={`/print/rnd/${r.id}`}
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
