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
  item_id: string | null;
  harga_referensi: number | null;
  moq: number | null;
  items: { satuan: string; moq: number | null } | null;
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
      "id, material_code, tradename, origin, noc, kategori, keterangan, item_id, harga_referensi, moq, items(satuan, moq), suppliers(nama), material_inci(inci_name, percentage)",
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

  /* Harga pembelian terakhir per item, cuma untuk baris halaman ini.
     Karena angkanya lahir dari query kedua seperti "Harga Terakhir" di
     Stock Items, kolomnya sengaja TIDAK dapat tombol urut: yang bisa
     diurutkan cuma satu halaman, dan hasilnya kelihatan benar padahal
     bukan (lihat bab Urutan tabel di CLAUDE.md). */
  const itemIds = list.map((m) => m.item_id).filter(Boolean) as string[];
  const hargaBeli = new Map<string, number>();
  if (itemIds.length > 0) {
    const { data: batches } = await supabase
      .from("purchase_batches")
      .select("item_id, harga_per_unit, created_at")
      .eq("organization_id", organizationId)
      .in("item_id", itemIds)
      .order("created_at", { ascending: false });
    for (const b of (batches || []) as { item_id: string; harga_per_unit: number }[]) {
      if (!hargaBeli.has(b.item_id)) {
        hargaBeli.set(b.item_id, Number(b.harga_per_unit));
      }
    }
  }

  /* Aturannya satu kalimat, dan sama dengan yang dipakai modul R&D:
     yang NYATA menang atas yang DIKETIK. Harga pembelian terakhir
     mengalahkan harga referensi, MOQ item mengalahkan MOQ material. */
  function hargaBerlaku(m: MaterialRow) {
    const beli = m.item_id ? hargaBeli.get(m.item_id) : undefined;
    if (beli != null) return { nilai: beli, dariPembelian: true };
    if (m.harga_referensi != null)
      return { nilai: Number(m.harga_referensi), dariPembelian: false };
    return null;
  }
  function moqBerlaku(m: MaterialRow) {
    const dariItem = m.item_id && m.items?.moq != null ? Number(m.items.moq) : null;
    return dariItem ?? (m.moq == null ? null : Number(m.moq));
  }
  const satuanOf = (m: MaterialRow) =>
    m.items?.satuan || (m.kategori === "Kemasan" ? "pcs" : "kg");

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
        minWidth={1120}
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
            key: "harga",
            header: "Harga Acuan",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (m) => {
              const h = hargaBerlaku(m);
              if (!h) return <span className="text-muted">-</span>;
              return (
                <>
                  Rp {h.nilai.toLocaleString("id-ID")}/{satuanOf(m)}
                  {!h.dariPembelian && (
                    <div className="text-[10.5px] text-muted">harga referensi</div>
                  )}
                </>
              );
            },
          },
          {
            key: "moq",
            header: "MOQ",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (m) => {
              const q = moqBerlaku(m);
              return q == null ? (
                <span className="text-muted">-</span>
              ) : (
                `${q.toLocaleString("id-ID")} ${satuanOf(m)}`
              );
            },
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