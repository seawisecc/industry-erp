import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

type BatchDetail = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  status: string;
  catatan: string | null;
  total_cost_bahan: number;
  production_outputs: {
    qty_hasil: number;
    satuan: string;
    varian_ukuran: string | null;
    products: { kode: string | null; nama_produk: string; brand: string | null } | null;
  }[];
  production_components: {
    qty_terpakai: number;
    harga_per_unit: number;
    subtotal: number;
    items: { kode: string; nama: string; satuan: string } | null;
    purchase_batches: {
      no_lot_supplier: string | null;
      exp_date: string | null;
      supplier_nama: string | null;
    } | null;
  }[];
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function ProductionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data } = await supabase
    .from("production_batches")
    .select(
      `id, no_batch_produksi, tanggal_produksi, status, catatan, total_cost_bahan,
       production_outputs(qty_hasil, satuan, varian_ukuran, products(kode, nama_produk, brand)),
       production_components(qty_terpakai, harga_per_unit, subtotal, items(kode, nama, satuan), purchase_batches(no_lot_supplier, exp_date, supplier_nama))`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const batch = data as unknown as BatchDetail;
  const out = batch.production_outputs?.[0];

  const totalPcs = batch.production_outputs.reduce(
    (s, o) => s + Number(o.qty_hasil),
    0
  );
  const costPerUnit = totalPcs > 0 ? Number(batch.total_cost_bahan) / totalPcs : 0;

  return (
    <div className="max-w-3xl">
      <Link
        href="/production"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Produksi
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <h1 className="font-display text-2xl font-semibold text-ink">
          <span className="font-mono text-[22px]">{batch.no_batch_produksi}</span>
        </h1>
        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-botanical-100 text-botanical-700">
          {batch.status}
        </span>
      </div>
      <p className="text-muted text-sm mb-6">
        {formatTanggal(batch.tanggal_produksi)}
        {batch.catatan ? ` — ${batch.catatan}` : ""}
      </p>

      <div className="glass rounded-2xl p-6 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[13.5px]">
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
            Produk
          </div>
          <div className="font-medium">{out?.products?.nama_produk || "—"}</div>
          <div className="text-[12px] text-muted">
            {out?.products?.brand || out?.products?.kode || ""}
          </div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
            Hasil per Ukuran
          </div>
          {batch.production_outputs.map((o, i) => (
            <div key={i} className="font-medium">
              {o.varian_ukuran ? `${o.varian_ukuran}: ` : ""}
              {Number(o.qty_hasil).toLocaleString("id-ID")} {o.satuan}
            </div>
          ))}
        </div>
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
            Cost Bahan / pcs (rata-rata)
          </div>
          <div className="font-medium">{formatRupiah(costPerUnit)}</div>
        </div>
      </div>

      <h2 className="font-display text-[15.5px] font-semibold text-ink mb-2">
        Bahan Terpakai (Traceability Lot)
      </h2>
      <div className="glass rounded-2xl overflow-x-auto mb-5">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Bahan</th>
              <th className="px-4 py-2.5 font-semibold">Lot Supplier</th>
              <th className="px-4 py-2.5 font-semibold">Exp</th>
              <th className="px-4 py-2.5 font-semibold text-right">Qty</th>
              <th className="px-4 py-2.5 font-semibold text-right">Harga/Unit</th>
              <th className="px-4 py-2.5 font-semibold text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {batch.production_components.map((c, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <span className="font-mono text-[11.5px] text-botanical-700 mr-2">
                    {c.items?.kode}
                  </span>
                  {c.items?.nama}
                  {c.purchase_batches?.supplier_nama && (
                    <div className="text-[11.5px] text-muted">
                      {c.purchase_batches.supplier_nama}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-[12px]">
                  {c.purchase_batches?.no_lot_supplier || "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                  {c.purchase_batches?.exp_date
                    ? new Date(
                        c.purchase_batches.exp_date + "T00:00:00"
                      ).toLocaleDateString("id-ID", {
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {Number(c.qty_terpakai).toLocaleString("id-ID")} {c.items?.satuan}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {formatRupiah(Number(c.harga_per_unit))}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {formatRupiah(Number(c.subtotal))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line">
              <td colSpan={5} className="px-4 py-3 text-right font-semibold">
                Total Cost Bahan
              </td>
              <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                {formatRupiah(Number(batch.total_cost_bahan))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
