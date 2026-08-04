import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Eye, Pencil } from "lucide-react";
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

type ProductRow = {
  id: string;
  kode: string | null;
  nama_produk: string;
  brand: string | null;
  kategori: string | null;
  aktif: boolean;
  product_formulas: { id: string }[];
  product_variants: { nama_varian: string }[];
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  let query = supabase
    .from("products")
    .select(
      "id, kode, nama_produk, brand, kategori, aktif, product_formulas(id), product_variants(nama_varian)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(ilikeOr(["kode", "nama_produk", "brand"], sp.q));
  if (sp.filter("status"))
    query = query.eq("aktif", sp.filter("status") === "Aktif");

  const { data: products, count } = await query
    .order("kode")
    .range(sp.from, sp.to);

  const list = (products || []) as unknown as ProductRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <ProdukShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Products</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} produk jadi, formula, varian,
            dan estimasi HPP
          </p>
        </div>
        <Link
          href="/products/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Tambah Produk
        </Link>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari kode / nama produk / brand..."
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
        rowKey={(p) => p.id}
        minWidth={860}
        empty={
          sp.q || sp.filter("status")
            ? "Tidak ada produk yang cocok dengan pencarian/filter."
            : "Belum ada produk."
        }
        columns={[
          {
            key: "kode",
            header: "Kode",
            role: "subtitle",
            cell: (p) => (
              <span className="font-mono text-[12.5px]">{p.kode || "-"}</span>
            ),
          },
          {
            key: "nama",
            header: "Nama Produk",
            role: "title",
            cell: (p) => <span className="font-medium">{p.nama_produk}</span>,
            cardCell: (p) => p.nama_produk,
          },
          {
            key: "brand",
            header: "Brand",
            role: "primary",
            cell: (p) => p.brand || "-",
          },
          {
            key: "kategori",
            header: "Kategori",
            role: "primary",
            cell: (p) => p.kategori || "-",
          },
          {
            key: "formulasi",
            header: "Formulasi",
            role: "secondary",
            cell: (p) =>
              p.product_formulas.length > 0 ? (
                <span className="text-[12.5px]">
                  {p.product_formulas.length} bahan
                </span>
              ) : (
                <span className="text-[12.5px] text-clay-600">Belum ada</span>
              ),
          },
          {
            key: "varian",
            header: "Varian",
            role: "secondary",
            cell: (p) =>
              p.product_variants.length > 0 ? (
                <span className="text-[12.5px]">
                  {p.product_variants.map((v) => v.nama_varian).join(", ")}
                </span>
              ) : (
                <span className="text-[12.5px] text-clay-600">Belum ada</span>
              ),
          },
          {
            key: "status",
            header: "Status",
            role: "badge",
            cell: (p) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                  p.aktif
                    ? "bg-botanical-100 text-botanical-700"
                    : "bg-clay-100 text-clay-600"
                }`}
              >
                {p.aktif ? "Aktif" : "Nonaktif"}
              </span>
            ),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            cell: (p) => (
              <RowActions>
                <IconAction
                  icon={Eye}
                  label="Lihat detail produk"
                  href={`/products/${p.id}`}
                  tone="primary"
                />
                <IconAction
                  icon={Pencil}
                  label="Edit produk"
                  href={`/products/${p.id}/edit`}
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
