import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import type { InciMaster } from "@/lib/types";
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

export default async function InciPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  let query = supabase
    .from("inci_master")
    .select("*", { count: "exact" })
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(ilikeOr(["inci_name", "cas_number", "function"], sp.q));

  const { data: inciList, count } = await query
    .order("inci_name")
    .range(sp.from, sp.to);

  const list = (inciList || []) as InciMaster[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <BahanShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">INCI Names</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} INCI Name terdaftar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/inci/new"
            className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={16} /> Tambah INCI Name
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <TableToolbar placeholder="Cari INCI name / CAS..." info={info} />
      </div>
      <DataTable
        rows={list}
        rowKey={(i) => i.id}
        minWidth={760}
        empty={
          sp.q
            ? "Tidak ada INCI Name yang cocok dengan pencarian."
            : "Belum ada INCI Name."
        }
        columns={[
          {
            key: "inci",
            header: "INCI Name",
            role: "title",
            cell: (i) => <span className="font-medium">{i.inci_name}</span>,
            cardCell: (i) => i.inci_name,
          },
          {
            key: "cas",
            header: "CAS Number",
            role: "primary",
            cell: (i) => i.cas_number || "-",
          },
          {
            key: "noael",
            header: "NOAEL",
            role: "primary",
            cell: (i) => i.noael || "-",
          },
          {
            key: "function",
            header: "Function",
            role: "secondary",
            cell: (i) => i.function || "-",
          },
          {
            key: "reference",
            header: "Reference",
            role: "secondary",
            headClassName: "w-[220px]",
            cell: (i) =>
              !i.reference ? (
                "-"
              ) : i.reference.startsWith("http") ? (
                <a
                  href={i.reference}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block max-w-[220px] truncate text-botanical-700 hover:underline"
                  title={i.reference}
                >
                  {i.reference.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              ) : (
                <span className="block max-w-[220px] truncate" title={i.reference}>
                  {i.reference}
                </span>
              ),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (i) => (
              <RowActions>
                <IconAction
                  icon={Pencil}
                  label="Edit INCI Name"
                  href={`/inci/${i.id}/edit`}
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