import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFinishedStock } from "@/lib/salesStock";
import ProdukShell from "@/components/ProdukShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import {
  PAGE_SIZE,
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";

export default async function FinishedGoodsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const sp = parseListQuery(await searchParams);

  const [{ data: products }, stock] = await Promise.all([
    supabase
      .from("products")
      .select("id, kode, nama_produk, brand")
      .eq("organization_id", organizationId),
    getFinishedStock(organizationId!),
  ]);

  const productMap = new Map(
    (
      (products || []) as {
        id: string;
        kode: string | null;
        nama_produk: string;
        brand: string | null;
      }[]
    ).map((p) => [p.id, p])
  );

  // Sumbernya agregat (RPC get_finished_stock), bukan tabel mentah, jadi
  // pencarian & halaman dikerjakan di sini — jumlah barisnya sudah dibatasi
  // oleh jumlah produk × varian, bukan jumlah transaksi.
  const semua = Array.from(stock.values())
    .map((s) => {
      const p = productMap.get(s.product_id);
      return {
        kode: p?.kode || null,
        nama: p?.nama_produk || "-",
        brand: p?.brand || null,
        varian: s.varian === "-" ? "-" : s.varian,
        produced: s.produced,
        consigned: s.consigned,
        sold: s.sold,
        available: s.available,
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama) || a.varian.localeCompare(b.varian));

  const needle = sp.q.toLowerCase();
  const cocok = needle
    ? semua.filter((r) =>
        [r.kode, r.nama, r.brand, r.varian]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle))
      )
    : semua;

  const list = cocok.slice(sp.from, sp.from + PAGE_SIZE);
  const info = pageInfo(sp.page, cocok.length, list.length);

  return (
    <ProdukShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Finished Goods</h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Stok produk jadi per varian, produksi, konsinyasi, terjual, tersedia
        </p>
      </div>

      <div className="mt-4">

        <TableToolbar placeholder="Cari produk / varian..." info={info} />

      </div>
      <DataTable
        rows={list}
        rowKey={(_r, i) => String(i)}
        minWidth={640}
        empty={
          sp.q
            ? "Tidak ada produk yang cocok dengan pencarian."
            : "Belum ada produk jadi, hasil muncul setelah produksi selesai."
        }
        columns={[
          {
            key: "kode",
            header: "Kode",
            role: "subtitle",
            cell: (r) => (
              <span className="font-mono text-[12.5px] whitespace-nowrap">
                {r.kode || "-"}
              </span>
            ),
          },
          {
            key: "nama",
            header: "Produk",
            role: "title",
            cell: (r) => (
              <>
                <div className="font-medium max-w-[220px] truncate">{r.nama}</div>
                {r.brand && (
                  <div className="text-[11.5px] text-muted">{r.brand}</div>
                )}
              </>
            ),
            cardCell: (r) => (
              <>
                <div>{r.nama}</div>
                {r.brand && (
                  <div className="text-[11.5px] text-muted font-normal">{r.brand}</div>
                )}
              </>
            ),
          },
          {
            key: "varian",
            header: "Varian",
            role: "badge",
            className: "whitespace-nowrap",
            cell: (r) => r.varian,
            cardCell: (r) => (
              <span className="inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium bg-white/70 text-muted whitespace-nowrap">
                {r.varian}
              </span>
            ),
          },
          {
            key: "produksi",
            header: "Produksi",
            role: "secondary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => r.produced.toLocaleString("id-ID"),
          },
          {
            key: "konsinyasi",
            header: "Konsinyasi",
            role: "secondary",
            align: "right",
            className: "whitespace-nowrap text-amber-500",
            cell: (r) => (
              <span className="text-amber-500">
                {r.consigned.toLocaleString("id-ID")}
              </span>
            ),
          },
          {
            key: "terjual",
            header: "Terjual",
            role: "secondary",
            align: "right",
            className: "whitespace-nowrap text-clay-600",
            cell: (r) => (
              <span className="text-clay-600">{r.sold.toLocaleString("id-ID")}</span>
            ),
          },
          {
            key: "tersedia",
            header: "Tersedia",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap font-semibold text-botanical-700",
            cell: (r) => (
              <span className="font-semibold text-botanical-700">
                {r.available.toLocaleString("id-ID")}
              </span>
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </ProdukShell>
  );
}
