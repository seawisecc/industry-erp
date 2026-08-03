import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFinishedStock } from "@/lib/salesStock";
import ProdukShell from "@/components/ProdukShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
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
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kode</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Produk</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Varian</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Produksi</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Konsinyasi</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Terjual</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Tersedia</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-10 text-sm">
                  {sp.q
                    ? "Tidak ada produk yang cocok dengan pencarian."
                    : "Belum ada produk jadi, hasil muncul setelah produksi selesai."}
                </td>
              </tr>
            ) : (
              list.map((r, i) => (
                <tr
                  key={i}
                  className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[12.5px] whitespace-nowrap">
                    {r.kode || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium max-w-[220px] truncate">{r.nama}</div>
                    {r.brand && (
                      <div className="text-[11.5px] text-muted">{r.brand}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.varian}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {r.produced.toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-amber-500">
                    {r.consigned.toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-clay-600">
                    {r.sold.toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-botanical-700">
                    {r.available.toLocaleString("id-ID")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination info={info} />
    </ProdukShell>
  );
}
