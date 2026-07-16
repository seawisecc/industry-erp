import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type AdjDetail = {
  id: string;
  tanggal: string;
  catatan: string | null;
  stock_adjustment_items: {
    qty_sebelum: number;
    qty_sesudah: number;
    harga_per_unit: number | null;
    items: { kode: string; nama: string; satuan: string } | null;
  }[];
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export default async function AdjustmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data } = await supabase
    .from("stock_adjustments")
    .select(
      `id, tanggal, catatan,
       stock_adjustment_items(qty_sebelum, qty_sesudah, harga_per_unit, items(kode, nama, satuan))`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const adj = data as unknown as AdjDetail;

  return (
    <div className="max-w-3xl">
      <Link
        href="/data-migration/adjustment"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Adjustment Stok
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Adjustment {formatTanggal(adj.tanggal)}
      </h1>
      <p className="text-muted text-sm mb-6">{adj.catatan || "Tanpa catatan"}</p>

      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Item</th>
              <th className="px-4 py-2.5 font-semibold text-right">Sebelum</th>
              <th className="px-4 py-2.5 font-semibold text-right">Sesudah</th>
              <th className="px-4 py-2.5 font-semibold text-right">Selisih</th>
              <th className="px-4 py-2.5 font-semibold text-right">Harga/Unit</th>
            </tr>
          </thead>
          <tbody>
            {adj.stock_adjustment_items.map((r, i) => {
              const diff = Number(r.qty_sesudah) - Number(r.qty_sebelum);
              return (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-mono text-[11.5px] text-botanical-700 mr-2">
                      {r.items?.kode}
                    </span>
                    {r.items?.nama}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatId(Number(r.qty_sebelum))} {r.items?.satuan}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatId(Number(r.qty_sesudah))} {r.items?.satuan}
                  </td>
                  <td
                    className={`px-4 py-3 text-right whitespace-nowrap font-medium ${
                      diff > 0 ? "text-botanical-700" : "text-clay-600"
                    }`}
                  >
                    {diff > 0 ? "+" : ""}
                    {formatId(diff)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {r.harga_per_unit != null
                      ? "Rp " + Number(r.harga_per_unit).toLocaleString("id-ID")
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
