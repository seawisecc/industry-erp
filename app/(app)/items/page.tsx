import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import {
  Plus,
  ListChecks,
  CalendarClock,
  ArrowUp,
  ArrowDown,
  Pencil,
} from "lucide-react";
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

type ItemRow = {
  id: string;
  kode: string;
  nama: string;
  kategori: "Bahan Baku" | "Kemasan";
  satuan: string;
  stok_minimum: number;
  purchase_batches: { qty_sisa: number }[];
  materials: { material_code: string; tradename: string }[];
};

const SORT: Record<string, string> = {
  kode: "kode",
  nama: "nama",
  kategori: "kategori",
  min: "stok_minimum",
  status: "aktif",
};

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  const ord = orderFor(sp, SORT, { column: "kode", ascending: true });

  let query = supabase
    .from("items")
    .select(
      "id, kode, nama, kategori, satuan, stok_minimum, purchase_batches(qty_sisa), materials(material_code, tradename)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q) query = query.or(ilikeOr(["kode", "nama"], sp.q));
  if (sp.filter("kategori"))
    query = query.eq("kategori", sp.filter("kategori"));

  const { data: items, count } = await query
    .order(ord.column, { ascending: ord.ascending })
    .range(sp.from, sp.to);

  const list = (items || []) as unknown as ItemRow[];
  const info = pageInfo(sp.page, count, list.length);

  // Riwayat harga beli (terbaru dulu) untuk harga terakhir + tren.
  // Cukup untuk item yang tampil di halaman ini, tidak perlu seluruh
  // riwayat pembelian organisasi.
  const { data: priceHistory } = await supabase
    .from("purchase_batches")
    .select("item_id, harga_per_unit, tanggal_terima, created_at")
    .eq("organization_id", organizationId)
    .in(
      "item_id",
      list.map((i) => i.id)
    )
    .order("created_at", { ascending: false });

  // Harga terakhir & harga sebelumnya per item → arah tren
  const hargaInfo = new Map<
    string,
    { last: number; prev: number | null; tanggal: string | null }
  >();
  for (const b of (priceHistory || []) as {
    item_id: string;
    harga_per_unit: number;
    tanggal_terima: string | null;
  }[]) {
    const harga = Number(b.harga_per_unit);
    if (harga <= 0) continue; // abaikan batch adjustment tanpa harga
    const cur = hargaInfo.get(b.item_id);
    if (!cur) {
      hargaInfo.set(b.item_id, {
        last: harga,
        prev: null,
        tanggal: b.tanggal_terima,
      });
    } else if (cur.prev === null) {
      cur.prev = harga;
    }
  }

  const stokSisa = (item: ItemRow) =>
    item.purchase_batches.reduce((s, b) => s + Number(b.qty_sisa), 0);

  /** Tren harga beli terakhir vs sebelumnya, jadi panah naik/turun. */
  function TrenHarga({ item }: { item: ItemRow }) {
    const hi = hargaInfo.get(item.id);
    if (!hi) return <span className="text-muted">-</span>;
    const selisihPct =
      hi.prev != null && hi.prev > 0 ? ((hi.last - hi.prev) / hi.prev) * 100 : null;
    const pct =
      selisihPct != null
        ? ` (${selisihPct > 0 ? "+" : ""}${selisihPct.toLocaleString("id-ID", {
            maximumFractionDigits: 1,
          })}%)`
        : "";
    const naik = hi.prev != null && hi.last > hi.prev;
    const turun = hi.prev != null && hi.last < hi.prev;
    return (
      <div className="inline-flex items-center gap-1.5 justify-end">
        <span className="font-medium">
          Rp {hi.last.toLocaleString("id-ID", { maximumFractionDigits: 0 })}
        </span>
        {naik && (
          <span
            className="inline-flex items-center text-clay-600"
            title={`Naik dari Rp ${hi.prev!.toLocaleString("id-ID")}${pct}`}
          >
            <ArrowUp size={13} strokeWidth={2.5} />
          </span>
        )}
        {turun && (
          <span
            className="inline-flex items-center text-botanical-700"
            title={`Turun dari Rp ${hi.prev!.toLocaleString("id-ID")}${pct}`}
          >
            <ArrowDown size={13} strokeWidth={2.5} />
          </span>
        )}
      </div>
    );
  }

  return (
    <BahanShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Stock Items
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} item terdaftar, stok masuk
            lewat menu Receiving
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/items/expiry"
            className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <CalendarClock size={14} /> Expiry Control
          </Link>
          <Link
            href="/items/from-material"
            className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <ListChecks size={14} /> Tambah dari Material
          </Link>
          <Link
            href="/items/new"
            className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={14} /> Tambah Item
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari kode / nama item..."
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
        rowKey={(i) => i.id}
        minWidth={880}
        empty={
          sp.q || sp.filter("kategori")
            ? "Tidak ada item yang cocok dengan pencarian/filter."
            : "Belum ada item."
        }
        columns={[
          {
            key: "kode",
            header: "Kode",
            sort: "kode",
            role: "subtitle",
            cell: (i) => (
              <span className="font-mono text-[12.5px] whitespace-nowrap">
                {i.kode}
              </span>
            ),
          },
          {
            key: "nama",
            header: "Nama",
            sort: "nama",
            role: "title",
            cell: (i) => (
              <>
                <div className="font-medium max-w-[260px] truncate" title={i.nama}>
                  {i.nama}
                </div>
                {i.materials?.[0] && (
                  <div className="text-[11.5px] text-muted font-mono">
                    {i.materials[0].material_code}
                  </div>
                )}
              </>
            ),
            cardCell: (i) => (
              <>
                <div>{i.nama}</div>
                {i.materials?.[0] && (
                  <div className="text-[11.5px] text-muted font-mono font-normal">
                    {i.materials[0].material_code}
                  </div>
                )}
              </>
            ),
          },
          {
            key: "kategori",
            header: "Kategori",
            sort: "kategori",
            role: "secondary",
            cell: (i) => (
              <span className="whitespace-nowrap text-[12.5px]">{i.kategori}</span>
            ),
          },
          {
            key: "harga",
            header: "Harga Terakhir",
            role: "secondary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (i) => <TrenHarga item={i} />,
          },
          {
            key: "stok",
            header: "Stok Sisa",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (i) => `${stokSisa(i).toLocaleString("id-ID")} ${i.satuan}`,
          },
          {
            key: "min",
            header: "Stok Min",
            sort: "min",
            cardLabel: "Stok Minimum",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (i) =>
              `${Number(i.stok_minimum).toLocaleString("id-ID")} ${i.satuan}`,
          },
          {
            key: "status",
            header: "Status",
            sort: "status",
            role: "badge",
            cell: (i) => {
              const low = stokSisa(i) <= Number(i.stok_minimum);
              return (
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium whitespace-nowrap ${
                    low
                      ? "bg-clay-100 text-clay-600"
                      : "bg-botanical-100 text-botanical-700"
                  }`}
                >
                  {low ? "Rendah" : "Aman"}
                </span>
              );
            },
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (i) => (
              <RowActions>
                <IconAction
                  icon={Pencil}
                  label="Edit item"
                  href={`/items/${i.id}/edit`}
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