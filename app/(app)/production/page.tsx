import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";

type BatchRow = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  status: string;
  total_cost_bahan: number;
  production_outputs: {
    qty_hasil: number;
    satuan: string;
    varian_ukuran: string | null;
    products: { kode: string | null; nama_produk: string; brand: string | null } | null;
  }[];
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ProductionPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: batches } = await supabase
    .from("production_batches")
    .select(
      "id, no_batch_produksi, tanggal_produksi, status, total_cost_bahan, production_outputs(qty_hasil, satuan, varian_ukuran, products(kode, nama_produk, brand))"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const list = (batches || []) as unknown as BatchRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Production</h1>
          <p className="text-muted text-sm mt-1">
            {list.length} batch produksi — stok bahan terpotong otomatis (FEFO)
          </p>
        </div>
        <Link
          href="/production/new"
          className="flex items-center gap-1.5 bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-sm hover:bg-botanical-800 transition-colors"
        >
          <Plus size={16} /> Produksi Baru
        </Link>
      </div>

      <div className="mt-6 glass rounded-2xl overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">No. Batch</th>
              <th className="px-4 py-2.5 font-semibold">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold">Produk</th>
              <th className="px-4 py-2.5 font-semibold text-right">Hasil</th>
              <th className="px-4 py-2.5 font-semibold text-right">Cost Bahan</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10 text-sm">
                  Belum ada produksi.
                </td>
              </tr>
            ) : (
              list.map((b) => {
                const out = b.production_outputs?.[0];
                return (
                  <tr
                    key={b.id}
                    className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[12.5px]">
                      {b.no_batch_produksi}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTanggal(b.tanggal_produksi)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium max-w-[260px] truncate">
                        {out?.products?.nama_produk || "—"}
                      </div>
                      <div className="text-[11.5px] text-muted">
                        {out?.products?.brand || out?.products?.kode || ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-[12.5px]">
                      {b.production_outputs.length === 0
                        ? "—"
                        : b.production_outputs
                            .map(
                              (o) =>
                                `${o.varian_ukuran ? o.varian_ukuran + ": " : ""}${Number(
                                  o.qty_hasil
                                ).toLocaleString("id-ID")} ${o.satuan}`
                            )
                            .join(" · ")}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatRupiah(Number(b.total_cost_bahan))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/production/${b.id}`}
                        className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
