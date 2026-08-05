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
import { TUJUAN_PEMAKAIAN } from "@/lib/materialIssue";
import TujuanBadge from "./TujuanBadge";

type IssueRow = {
  id: string;
  no_pemakaian: string;
  tanggal: string;
  tujuan: string;
  catatan: string | null;
  total_biaya: number;
  dibuat_oleh: string | null;
  material_issue_items: { item_id: string }[];
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

export default async function MaterialIssuesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  let query = supabase
    .from("material_issues")
    .select(
      "id, no_pemakaian, tanggal, tujuan, catatan, total_biaya, dibuat_oleh, material_issue_items(item_id)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q) query = query.or(ilikeOr(["no_pemakaian", "catatan"], sp.q));
  if (sp.filter("tujuan")) query = query.eq("tujuan", sp.filter("tujuan"));

  const [{ data: issues, count }, { data: profiles }] = await Promise.all([
    query.order("tanggal", { ascending: false }).range(sp.from, sp.to),
    supabase
      .from("profiles")
      .select("id, nama")
      .eq("organization_id", organizationId),
  ]);

  const list = (issues || []) as unknown as IssueRow[];
  const info = pageInfo(sp.page, count, list.length);
  const namaOleh = new Map(
    ((profiles || []) as { id: string; nama: string }[]).map((p) => [p.id, p.nama])
  );

  // Satu dokumen bisa punya beberapa baris untuk item yang sama kalau
  // FEFO menyeberang lot, jadi yang dihitung item unik, bukan barisnya.
  const jumlahBahan = (r: IssueRow) =>
    new Set(r.material_issue_items.map((i) => i.item_id)).size;

  return (
    <BahanShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Material Issue
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} dokumen · bahan yang keluar di
            luar produksi (R&amp;D, cleaning, sampel)
          </p>
        </div>
        <Link
          href="/material-issues/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={14} /> Pemakaian Baru
        </Link>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari nomor / catatan..."
          info={info}
          filters={[
            {
              param: "tujuan",
              label: "Semua Tujuan",
              options: TUJUAN_PEMAKAIAN.map((t) => ({ value: t, label: t })),
            },
          ]}
        />
      </div>

      <DataTable
        rows={list}
        rowKey={(r) => r.id}
        minWidth={820}
        empty={
          sp.q || sp.filter("tujuan")
            ? "Tidak ada dokumen yang cocok dengan pencarian/filter."
            : "Belum ada pemakaian bahan tercatat."
        }
        columns={[
          {
            key: "no",
            header: "No. Pemakaian",
            role: "subtitle",
            className: "font-mono text-[12px] whitespace-nowrap",
            cell: (r) => r.no_pemakaian,
          },
          {
            key: "tanggal",
            header: "Tanggal",
            role: "title",
            className: "whitespace-nowrap",
            cell: (r) => formatTanggal(r.tanggal),
          },
          {
            key: "tujuan",
            header: "Tujuan",
            role: "badge",
            cell: (r) => <TujuanBadge tujuan={r.tujuan} />,
          },
          {
            key: "bahan",
            header: "Bahan",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => `${jumlahBahan(r)} bahan`,
          },
          {
            key: "biaya",
            header: "Nilai Bahan",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap font-medium",
            cell: (r) => formatRupiah(Number(r.total_biaya)),
          },
          {
            key: "catatan",
            header: "Catatan",
            role: "secondary",
            cell: (r) => (
              <div className="max-w-[220px] truncate">{r.catatan || "-"}</div>
            ),
            cardCell: (r) => r.catatan || "-",
          },
          {
            key: "oleh",
            header: "Oleh",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (r) => (r.dibuat_oleh && namaOleh.get(r.dibuat_oleh)) || "-",
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (r) => (
              <RowActions>
                <IconAction
                  icon={Eye}
                  label="Lihat detail pemakaian"
                  href={`/material-issues/${r.id}`}
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
