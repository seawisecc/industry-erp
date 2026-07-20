import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";
import ProdukShell from "@/components/ProdukShell";
import TableSearch from "@/components/TableSearch";

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

export default async function ProductsPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: products } = await supabase
    .from("products")
    .select(
      "id, kode, nama_produk, brand, kategori, aktif, product_formulas(id), product_variants(nama_varian)"
    )
    .eq("organization_id", organizationId)
    .order("kode");

  const list = (products || []) as unknown as ProductRow[];

  return (
    <ProdukShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Products</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {list.length} produk jadi — formula, varian, dan estimasi HPP
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
        <TableSearch
          placeholder="Cari kode / nama produk / brand..."
          filters={[{ label: "Semua Status", options: ["Aktif", "Nonaktif"] }]}
        />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kode</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Nama Produk</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Brand</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Kategori</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Formulasi</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Varian</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-10 text-sm">
                  Belum ada produk.
                </td>
              </tr>
            ) : (
              list.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[12.5px]">{p.kode || "—"}</td>
                  <td className="px-4 py-3 font-medium">{p.nama_produk}</td>
                  <td className="px-4 py-3">{p.brand || "—"}</td>
                  <td className="px-4 py-3">{p.kategori || "—"}</td>
                  <td className="px-4 py-3">
                    {p.product_formulas.length > 0 ? (
                      <span className="text-[12.5px]">
                        {p.product_formulas.length} bahan
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-clay-600">Belum ada</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.product_variants.length > 0 ? (
                      <span className="text-[12.5px]">
                        {p.product_variants.map((v) => v.nama_varian).join(", ")}
                      </span>
                    ) : (
                      <span className="text-[12.5px] text-clay-600">Belum ada</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                        p.aktif
                          ? "bg-botanical-100 text-botanical-700"
                          : "bg-clay-100 text-clay-600"
                      }`}
                    >
                      {p.aktif ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/products/${p.id}`}
                      className="text-botanical-700 text-[12.5px] font-medium hover:underline mr-3"
                    >
                      Detail
                    </Link>
                    <Link
                      href={`/products/${p.id}/edit`}
                      className="text-muted text-[12.5px] font-medium hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ProdukShell>
  );
}
