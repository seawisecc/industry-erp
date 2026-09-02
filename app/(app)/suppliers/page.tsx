import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import type { Supplier } from "@/lib/types";
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

const SORT: Record<string, string> = {
  nama: "nama",
  kontak: "nama_kontak",
  telp: "no_telp",
  email: "email",
  npwp: "npwp",
};

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  const ord = orderFor(sp, SORT, { column: "nama", ascending: true });

  let query = supabase
    .from("suppliers")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId);

  if (sp.q) query = query.or(ilikeOr(["nama", "nama_kontak", "email"], sp.q));

  const { data: suppliers, count } = await query
    .order(ord.column, { ascending: ord.ascending })
    .range(sp.from, sp.to);

  const list = (suppliers || []) as Supplier[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Suppliers</h1>
          <p className="text-muted text-sm mt-1">
            {info.total.toLocaleString("id-ID")} supplier terdaftar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/suppliers/new"
            className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={16} /> Tambah Supplier
          </Link>
        </div>
      </div>

      <div className="mt-4">

        <TableToolbar placeholder="Cari nama / kontak supplier..." info={info} />

      </div>
      <DataTable
        rows={list}
        rowKey={(s) => s.id}
        minWidth={860}
        empty={
          sp.q
            ? "Tidak ada supplier yang cocok dengan pencarian."
            : "Belum ada supplier."
        }
        columns={[
          {
            key: "nama",
            header: "Nama",
            sort: "nama",
            role: "title",
            cell: (s) => (
              <>
                <div className="font-medium whitespace-nowrap">{s.nama}</div>
                <div
                  className="text-[11.5px] text-muted max-w-[300px] truncate"
                  title={s.alamat || undefined}
                >
                  {s.alamat}
                </div>
              </>
            ),
            cardCell: (s) => (
              <>
                <div>{s.nama}</div>
                {s.alamat && (
                  <div className="text-[11.5px] text-muted font-normal leading-snug">
                    {s.alamat}
                  </div>
                )}
              </>
            ),
          },
          {
            key: "kontak",
            header: "Kontak",
            sort: "kontak",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (s) => s.nama_kontak || "-",
          },
          {
            key: "telp",
            header: "Telp",
            sort: "telp",
            role: "primary",
            className: "whitespace-nowrap font-mono text-[12.5px]",
            cell: (s) => (
              <span className="font-mono text-[12.5px]">{s.no_telp || "-"}</span>
            ),
          },
          {
            key: "email",
            header: "Email",
            sort: "email",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (s) => s.email || "-",
          },
          {
            key: "npwp",
            header: "NPWP",
            sort: "npwp",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (s) => (
              <span className="font-mono text-[12.5px]">{s.npwp || "-"}</span>
            ),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (s) => (
              <RowActions>
                <IconAction
                  icon={Pencil}
                  label="Edit supplier"
                  href={`/suppliers/${s.id}/edit`}
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