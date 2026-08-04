import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import ProdukShell from "@/components/ProdukShell";
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

type ServiceRow = {
  id: string;
  kode: string | null;
  nama_jasa: string;
  keterangan: string | null;
  biaya: number;
  aktif: boolean;
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  let query = supabase
    .from("services")
    .select("id, kode, nama_jasa, keterangan, biaya, aktif", {
      count: "exact",
    })
    .eq("organization_id", organizationId);

  if (sp.q) query = query.or(ilikeOr(["kode", "nama_jasa", "keterangan"], sp.q));
  if (sp.filter("status"))
    query = query.eq("aktif", sp.filter("status") === "Aktif");

  const { data: services, count } = await query
    .order("kode")
    .range(sp.from, sp.to);

  const list = (services || []) as ServiceRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <ProdukShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Services</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} layanan jasa, bisa dijual lewat
            Invoice &amp; POS
          </p>
        </div>
        <Link
          href="/services/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={14} /> Tambah Jasa
        </Link>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari kode / nama jasa..."
          info={info}
          filters={[
            {
              param: "status",
              label: "Semua Status",
              options: [
                { value: "Aktif", label: "Aktif" },
                { value: "Nonaktif", label: "Nonaktif" },
              ],
            },
          ]}
        />
      </div>
      <DataTable
        rows={list}
        rowKey={(s) => s.id}
        minWidth={720}
        empty={
          sp.q || sp.filter("status")
            ? "Tidak ada layanan jasa yang cocok dengan pencarian/filter."
            : "Belum ada layanan jasa. Tambahkan misalnya: Jasa Formulasi, Uji Stabilitas, Notifikasi BPOM."
        }
        columns={[
          {
            key: "kode",
            header: "Kode",
            role: "subtitle",
            cell: (s) => (
              <span className="font-mono text-[12.5px] whitespace-nowrap">
                {s.kode || "-"}
              </span>
            ),
          },
          {
            key: "nama",
            header: "Nama Jasa",
            role: "title",
            cell: (s) => (
              <div className="font-medium max-w-[240px] truncate" title={s.nama_jasa}>
                {s.nama_jasa}
              </div>
            ),
            cardCell: (s) => s.nama_jasa,
          },
          {
            key: "keterangan",
            header: "Keterangan",
            role: "secondary",
            cell: (s) => (
              <div
                className="max-w-[260px] text-[12.5px] text-muted line-clamp-2"
                title={s.keterangan || undefined}
              >
                {s.keterangan || "-"}
              </div>
            ),
            cardCell: (s) => (
              <span className="text-[12.5px]">{s.keterangan || "-"}</span>
            ),
          },
          {
            key: "biaya",
            header: "Biaya",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap font-medium",
            cell: (s) => formatRupiah(Number(s.biaya)),
          },
          {
            key: "status",
            header: "Status",
            role: "badge",
            cell: (s) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                  s.aktif
                    ? "bg-botanical-100 text-botanical-700"
                    : "bg-clay-100 text-clay-600"
                }`}
              >
                {s.aktif ? "Aktif" : "Nonaktif"}
              </span>
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
                  label="Edit layanan jasa"
                  href={`/services/${s.id}/edit`}
                  tone="primary"
                />
              </RowActions>
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </ProdukShell>
  );
}
