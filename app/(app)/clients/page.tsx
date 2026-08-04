import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import SalesShell from "@/components/SalesShell";
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

type ClientRow = {
  id: string;
  kode: string | null;
  company_brand: string;
  cp: string | null;
  npwp: string | null;
  phone: string | null;
  kategori: string;
  alamat: string | null;
  aktif: boolean;
};

const KATEGORI_STYLE: Record<string, string> = {
  "Brand Owner": "bg-botanical-100 text-botanical-700",
  "University/Corporation": "bg-amber-100 text-amber-500",
  Research: "bg-amber-100 text-amber-500",
  Reseller: "bg-clay-100 text-clay-600",
  "Walk In Customer": "bg-white/70 text-muted border border-line",
  Other: "bg-white/70 text-muted border border-line",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  let query = supabase
    .from("clients")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId);

  if (sp.q) query = query.or(ilikeOr(["kode", "company_brand", "cp"], sp.q));
  if (sp.filter("kategori"))
    query = query.eq("kategori", sp.filter("kategori"));

  const { data: clients, count } = await query
    .order("kode")
    .range(sp.from, sp.to);

  const list = (clients || []) as ClientRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <SalesShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Clients</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} client terdaftar, dipakai di
            konsinyasi, invoice, dan POS
          </p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Tambah Client
        </Link>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari kode / nama client..."
          info={info}
          filters={[
            {
              param: "kategori",
              label: "Semua Kategori",
              options: [
                "Brand Owner",
                "University/Corporation",
                "Research",
                "Reseller",
                "Walk In Customer",
                "Other",
              ].map((k) => ({ value: k, label: k })),
            },
          ]}
        />
      </div>
      <DataTable
        rows={list}
        rowKey={(c) => c.id}
        minWidth={880}
        empty={
          sp.q || sp.filter("kategori")
            ? "Tidak ada client yang cocok dengan pencarian/filter."
            : "Belum ada client."
        }
        columns={[
          {
            key: "kode",
            header: "Kode",
            role: "subtitle",
            cell: (c) => (
              <span className="font-mono text-[12.5px] whitespace-nowrap">
                {c.kode || "-"}
              </span>
            ),
          },
          {
            key: "company",
            header: "Company / Brand",
            role: "title",
            cell: (c) => (
              <>
                <div className="font-medium max-w-[220px] truncate" title={c.company_brand}>
                  {c.company_brand}
                </div>
                {c.alamat && (
                  <div
                    className="text-[11.5px] text-muted max-w-[220px] truncate"
                    title={c.alamat}
                  >
                    {c.alamat}
                  </div>
                )}
              </>
            ),
            cardCell: (c) => (
              <>
                <div>{c.company_brand}</div>
                {c.alamat && (
                  <div className="text-[11.5px] text-muted font-normal leading-snug">
                    {c.alamat}
                  </div>
                )}
              </>
            ),
          },
          {
            key: "cp",
            header: "CP",
            cardLabel: "Contact Person",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (c) => c.cp || "-",
          },
          {
            key: "phone",
            header: "Phone",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (c) => (
              <span className="font-mono text-[12.5px]">{c.phone || "-"}</span>
            ),
          },
          {
            key: "kategori",
            header: "Kategori",
            role: "badge",
            cell: (c) => (
              <span
                className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  KATEGORI_STYLE[c.kategori] || KATEGORI_STYLE.Other
                }`}
              >
                {c.kategori}
              </span>
            ),
          },
          {
            key: "status",
            header: "Status",
            role: "badge",
            cell: (c) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                  c.aktif
                    ? "bg-botanical-100 text-botanical-700"
                    : "bg-clay-100 text-clay-600"
                }`}
              >
                {c.aktif ? "Aktif" : "Nonaktif"}
              </span>
            ),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (c) => (
              <RowActions>
                <IconAction
                  icon={Pencil}
                  label="Edit client"
                  href={`/clients/${c.id}/edit`}
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
