import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import { getDocSigners } from "@/lib/docSignServer";
import PrintButton from "../../po/[id]/PrintButton";

type BatchPrint = {
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
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatExp(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    month: "short",
    year: "numeric",
  });
}

export default async function PrintProductionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }, { data: settings }] = await Promise.all([
    supabase
      .from("production_batches")
      .select(
        `id, no_batch_produksi, tanggal_produksi, status, catatan, total_cost_bahan,
         production_outputs(qty_hasil, satuan, varian_ukuran, products(kode, nama_produk, brand)),
         production_components(qty_terpakai, harga_per_unit, subtotal, items(kode, nama, satuan), purchase_batches(no_lot_supplier, exp_date, supplier_nama))`
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
    supabase
      .from("organization_settings")
      .select("alamat, no_telp, email")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (!data) notFound();
  const batch = data as unknown as BatchPrint;
  const produk = batch.production_outputs?.[0]?.products;

  const totalPcs = batch.production_outputs.reduce(
    (s, o) => s + Number(o.qty_hasil),
    0
  );
  const costPerUnit = totalPcs > 0 ? Number(batch.total_cost_bahan) / totalPcs : 0;

  // Kolom tanda tangan sesuai pengaturan Document Signing
  const signers = await getDocSigners(organizationId!, "production");

  const kontakLine = [
    settings?.no_telp ? `Telp: ${settings.no_telp}` : null,
    settings?.email ? `Email: ${settings.email}` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <div className="min-h-screen py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { body { background: white !important; } }
      `}</style>

      <PrintButton />

      {/* Kertas */}
      <div className="bg-white text-[#1a1a1a] max-w-[210mm] mx-auto shadow-xl print:shadow-none rounded-sm print:rounded-none p-[15mm] print:p-0 text-[12.5px] leading-relaxed">
        {/* ===== KOP ===== */}
        <div className="flex justify-between items-start border-b-2 border-[#1a1a1a] pb-4">
          <div>
            <div className="font-display text-[22px] font-bold leading-tight">
              {org?.nama}
            </div>
            {settings?.alamat && (
              <div className="text-[11.5px] text-neutral-600 mt-1 max-w-[90mm] whitespace-pre-line">
                {settings.alamat}
              </div>
            )}
            {kontakLine && (
              <div className="text-[11px] text-neutral-600 mt-0.5">{kontakLine}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[20px] font-bold tracking-wide">BATCH RECORD</div>
            <div className="font-mono text-[13px] mt-1">{batch.no_batch_produksi}</div>
            <div className="text-[11.5px] text-neutral-600 mt-0.5">
              Tanggal Produksi: {formatTanggal(batch.tanggal_produksi)}
            </div>
          </div>
        </div>

        {/* ===== INFO PRODUK ===== */}
        <div className="mt-5 grid grid-cols-3 gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
              Produk
            </div>
            <div className="font-semibold text-[13.5px]">
              {produk?.nama_produk || "—"}
            </div>
            <div className="text-[11.5px] text-neutral-600">
              {[produk?.kode, produk?.brand].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
              Hasil Produksi
            </div>
            {batch.production_outputs.map((o, i) => (
              <div key={i} className="text-[13px]">
                {o.varian_ukuran ? `${o.varian_ukuran}: ` : ""}
                <b>{Number(o.qty_hasil).toLocaleString("id-ID")}</b> {o.satuan}
              </div>
            ))}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
              HPP Bahan / pcs
            </div>
            <div className="font-semibold text-[13.5px]">
              {formatRupiah(costPerUnit)}
            </div>
            <div className="text-[11.5px] text-neutral-600">
              Total bahan: {formatRupiah(Number(batch.total_cost_bahan))}
            </div>
          </div>
        </div>

        {/* ===== TABEL BAHAN (TRACEABILITY) ===== */}
        <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-6 mb-1">
          Bahan Terpakai — Traceability Lot
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wide border-y-2 border-[#1a1a1a]">
              <th className="py-2 pr-2 text-left">Kode</th>
              <th className="py-2 pr-2 text-left">Bahan</th>
              <th className="py-2 pr-2 text-left">Lot Supplier</th>
              <th className="py-2 pr-2 text-left">Exp</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {batch.production_components.map((c, i) => (
              <tr key={i} className="border-b border-neutral-300">
                <td className="py-2 pr-2 font-mono text-[11px] whitespace-nowrap">
                  {c.items?.kode}
                </td>
                <td className="py-2 pr-2">
                  {c.items?.nama}
                  {c.purchase_batches?.supplier_nama && (
                    <div className="text-[10.5px] text-neutral-500">
                      {c.purchase_batches.supplier_nama}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-2 font-mono text-[11px] whitespace-nowrap">
                  {c.purchase_batches?.no_lot_supplier || "—"}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-[11.5px]">
                  {formatExp(c.purchase_batches?.exp_date || null)}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">
                  {Number(c.qty_terpakai).toLocaleString("id-ID", {
                    maximumFractionDigits: 3,
                  })}{" "}
                  {c.items?.satuan}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {formatRupiah(Number(c.subtotal))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#1a1a1a]">
              <td colSpan={5} className="py-2 pr-2 text-right font-semibold">
                Total Cost Bahan
              </td>
              <td className="py-2 text-right font-bold whitespace-nowrap">
                {formatRupiah(Number(batch.total_cost_bahan))}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* ===== CATATAN ===== */}
        {batch.catatan && (
          <div className="mt-4 text-[11.5px]">
            <span className="text-neutral-500">Catatan: </span>
            {batch.catatan}
          </div>
        )}

        {/* ===== TANDA TANGAN ===== */}
        {signers.length > 0 && (
          <div
            className="mt-10 grid gap-6 text-center break-inside-avoid"
            style={{ gridTemplateColumns: `repeat(${signers.length}, 1fr)` }}
          >
            {signers.map((s, i) => (
              <div key={i}>
                <div className="text-[12px]">{s.label}</div>
                <div className="h-[22mm]" />
                <div className="font-semibold border-b border-[#1a1a1a] inline-block min-w-[40mm] pb-0.5">
                  {s.nama || "(............................)"}
                </div>
                <div className="text-[11px] text-neutral-600 mt-1">
                  {s.jabatan || ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== FOOTER ===== */}
        <div className="mt-10 pt-3 border-t border-neutral-300 text-[10px] text-neutral-400 flex justify-between">
          <span>Dokumen internal — Batch Record {batch.no_batch_produksi}</span>
          <span>{org?.nama}</span>
        </div>
      </div>
    </div>
  );
}
