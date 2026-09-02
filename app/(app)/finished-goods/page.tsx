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
  urutkanBaris,
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

  const [{ data: products }, { data: varian }, stock] = await Promise.all([
    supabase
      .from("products")
      .select("id, kode, nama_produk, brand")
      .eq("organization_id", organizationId),
    // Harga jual menempel di varian, bukan di produk, dan kuncinya nama
    // varian sebagai TEKS persis seperti kunci stok. Varian yang namanya
    // diganti kehilangan harganya, dan itu memang gejala yang dijaga
    // assertVarianBerstokTidakHilang di updateProduct.
    supabase
      .from("product_variants")
      .select("product_id, nama_varian, harga_jual")
      .eq("organization_id", organizationId),
    getFinishedStock(organizationId!),
  ]);

  const hargaMap = new Map<string, number>();
  for (const v of (varian || []) as {
    product_id: string;
    nama_varian: string | null;
    harga_jual: number | null;
  }[]) {
    // `harga_jual` boleh null dan tiap pembacanya wajib menyaringnya:
    // Number(null) bernilai 0, bukan NaN, jadi varian tanpa harga akan
    // terbaca "Rp 0" yang kelihatan seperti harga sungguhan.
    if (v.harga_jual == null) continue;
    hargaMap.set(`${v.product_id}|${v.nama_varian ?? "-"}`, Number(v.harga_jual));
  }

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
  // pencarian & halaman dikerjakan di sini, jumlah barisnya sudah dibatasi
  // oleh jumlah produk × varian, bukan jumlah transaksi.
  const semua = Array.from(stock.values())
    .map((s) => {
      const p = productMap.get(s.product_id);
      return {
        kode: p?.kode || null,
        nama: p?.nama_produk || "-",
        brand: p?.brand || null,
        varian: s.varian === "-" ? "-" : s.varian,
        harga: hargaMap.get(`${s.product_id}|${s.varian}`) ?? null,
        produced: s.produced,
        consigned: s.consigned,
        sold: s.sold,
        adjustment: s.adjustment,
        available: s.available,
      };
    });

  const needle = sp.q.toLowerCase();
  const cocok = needle
    ? semua.filter((r) =>
        [r.kode, r.nama, r.brand, r.varian]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle))
      )
    : semua;

  // Datanya sudah utuh di memori (agregat RPC, bukan tabel mentah), jadi
  // urutannya dikerjakan SEBELUM dipotong per halaman. Kalau dibalik,
  // yang terurut cuma 50 baris yang kebetulan sedang tampil.
  const urut = urutkanBaris(
    cocok,
    sp,
    {
      kode: (r) => r.kode,
      nama: (r) => r.nama,
      varian: (r) => r.varian,
      harga: (r) => r.harga,
      produksi: (r) => r.produced,
      konsinyasi: (r) => r.consigned,
      terjual: (r) => r.sold,
      koreksi: (r) => r.adjustment,
      tersedia: (r) => r.available,
    },
    // Urutan bawaan: kode produk. Itu yang dipakai orang gudang untuk
    // mencocokkan dengan rak, bukan nama produknya. Produk tanpa kode
    // didorong ke bawah, bukan ke atas.
    (a, b) =>
      (a.kode || "\uffff").localeCompare(b.kode || "\uffff", "id", {
        numeric: true,
      }) || a.varian.localeCompare(b.varian, "id", { numeric: true })
  );

  const list = urut.slice(sp.from, sp.from + PAGE_SIZE);
  const info = pageInfo(sp.page, urut.length, list.length);

  return (
    <ProdukShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Finished Goods</h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Stok produk jadi per varian: harga jual, produksi, konsinyasi,
          terjual, koreksi opname, tersedia. Klik judul kolom untuk mengurutkan
        </p>
      </div>

      <div className="mt-4">

        <TableToolbar placeholder="Cari produk / varian..." info={info} />

      </div>
      <DataTable
        rows={list}
        rowKey={(_r, i) => String(i)}
        minWidth={760}
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
            sort: "kode",
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
            sort: "nama",
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
            sort: "varian",
            className: "whitespace-nowrap",
            cell: (r) => r.varian,
            cardCell: (r) => (
              <span className="inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium bg-white/70 text-muted whitespace-nowrap">
                {r.varian}
              </span>
            ),
          },
          {
            key: "harga",
            header: "Harga Jual",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            sort: "harga",
            cell: (r) =>
              r.harga == null ? (
                // Varian tanpa harga bukan varian seharga nol. Yang
                // paling sering bikin ini kosong: varian yatim yang
                // namanya sudah tidak ada lagi di master produk.
                <span className="text-muted" title="Belum ada harga jual di master produk">
                  -
                </span>
              ) : (
                "Rp " + r.harga.toLocaleString("id-ID")
              ),
          },
          {
            key: "produksi",
            header: "Produksi",
            role: "secondary",
            sort: "produksi",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => r.produced.toLocaleString("id-ID"),
          },
          {
            key: "konsinyasi",
            header: "Konsinyasi",
            role: "secondary",
            sort: "konsinyasi",
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
            sort: "terjual",
            align: "right",
            className: "whitespace-nowrap text-clay-600",
            cell: (r) => (
              <span className="text-clay-600">{r.sold.toLocaleString("id-ID")}</span>
            ),
          },
          {
            key: "koreksi",
            header: "Koreksi",
            cardLabel: "Koreksi opname",
            role: "secondary",
            sort: "koreksi",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) =>
              r.adjustment === 0 ? (
                <span className="text-muted">-</span>
              ) : (
                <span
                  className={
                    r.adjustment > 0 ? "text-botanical-700" : "text-clay-600"
                  }
                >
                  {r.adjustment > 0 ? "+" : ""}
                  {r.adjustment.toLocaleString("id-ID")}
                </span>
              ),
          },
          {
            key: "tersedia",
            header: "Tersedia",
            role: "primary",
            sort: "tersedia",
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
