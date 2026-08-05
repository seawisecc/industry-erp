import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import { getDocSigners } from "@/lib/docSignServer";
import PrintButton from "../../po/[id]/PrintButton";

type ReturPrint = {
  id: string;
  no_retur: string;
  tanggal: string;
  supplier_nama: string | null;
  alasan: string;
  catatan: string | null;
  total_nilai: number;
  receivings: {
    no_invoice: string | null;
    tanggal_terima: string;
    ppn_percent: number;
    total_invoice: number;
    total_retur: number;
    purchase_orders: { no_po: string | null } | null;
  } | null;
  purchase_return_items: {
    qty: number;
    harga_per_unit: number;
    subtotal: number;
    items: { kode: string; nama: string; satuan: string } | null;
    purchase_batches: {
      no_lot_supplier: string | null;
      exp_date: string | null;
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
  if (!iso) return "-";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    month: "short",
    year: "numeric",
  });
}

export default async function PrintPurchaseReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }, { data: settings }] = await Promise.all([
    supabase
      .from("purchase_returns")
      .select(
        `id, no_retur, tanggal, supplier_nama, alasan, catatan, total_nilai,
         receivings(no_invoice, tanggal_terima, ppn_percent, total_invoice, total_retur,
           purchase_orders(no_po)),
         purchase_return_items(qty, harga_per_unit, subtotal,
           items(kode, nama, satuan),
           purchase_batches(no_lot_supplier, exp_date))`
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
  const retur = data as unknown as ReturPrint;

  const subtotal = retur.purchase_return_items.reduce(
    (s, r) => s + Number(r.subtotal),
    0
  );
  const ppn = Number(retur.total_nilai) - subtotal;
  const sisaTagihan = Math.max(
    Number(retur.receivings?.total_invoice ?? 0) -
      Number(retur.receivings?.total_retur ?? 0),
    0
  );

  const signers = await getDocSigners(organizationId!, "purchase-return");

  const kontakLine = [
    settings?.no_telp ? `Telp: ${settings.no_telp}` : null,
    settings?.email ? `Email: ${settings.email}` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <div className="min-h-screen py-4 sm:py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { body { background: white !important; } }
      `}</style>

      <PrintButton />

      <div className="bg-white text-[#1a1a1a] a4-sheet max-w-[210mm] mx-auto shadow-xl print:shadow-none rounded-sm print:rounded-none p-[15mm] print:p-0 text-[12.5px] leading-relaxed">
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
            <div className="text-[19px] font-bold tracking-wide">
              NOTA RETUR PEMBELIAN
            </div>
            <div className="font-mono text-[13px] mt-1">{retur.no_retur}</div>
            <div className="text-[11.5px] text-neutral-600 mt-0.5">
              Tanggal: {formatTanggal(retur.tanggal)}
            </div>
          </div>
        </div>

        {/* ===== TUJUAN & RUJUKAN ===== */}
        <div className="mt-5 grid grid-cols-2 gap-8">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
              Kepada Supplier
            </div>
            <div className="font-semibold text-[14px]">
              {retur.supplier_nama || "-"}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-1">
              Rujukan
            </div>
            <div className="text-[12.5px]">
              Faktur:{" "}
              <b className="font-mono">
                {retur.receivings?.no_invoice || "(tanpa nomor)"}
              </b>
            </div>
            {retur.receivings?.purchase_orders?.no_po && (
              <div className="text-[12.5px]">
                PO:{" "}
                <b className="font-mono">
                  {retur.receivings.purchase_orders.no_po}
                </b>
              </div>
            )}
            {retur.receivings?.tanggal_terima && (
              <div className="text-[12.5px]">
                Diterima: {formatTanggal(retur.receivings.tanggal_terima)}
              </div>
            )}
            <div className="text-[12.5px]">
              Alasan retur: <b>{retur.alasan}</b>
            </div>
          </div>
        </div>

        {/* ===== TABEL BARANG ===== */}
        <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-6 mb-1">
          Barang yang Dikembalikan
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wide border-y-2 border-[#1a1a1a]">
              <th className="py-2 pr-2 text-left w-[8mm]">No</th>
              <th className="py-2 pr-2 text-left">Kode</th>
              <th className="py-2 pr-2 text-left">Nama Barang</th>
              <th className="py-2 pr-2 text-left">Lot Supplier</th>
              <th className="py-2 pr-2 text-left">Exp</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Harga</th>
              <th className="py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {retur.purchase_return_items.map((r, i) => (
              <tr key={i} className="border-b border-neutral-300">
                <td className="py-2 pr-2">{i + 1}</td>
                <td className="py-2 pr-2 font-mono text-[11px] whitespace-nowrap">
                  {r.items?.kode}
                </td>
                <td className="py-2 pr-2">{r.items?.nama}</td>
                <td className="py-2 pr-2 font-mono text-[11px] whitespace-nowrap">
                  {r.purchase_batches?.no_lot_supplier || "-"}
                </td>
                <td className="py-2 pr-2 whitespace-nowrap text-[11.5px]">
                  {formatExp(r.purchase_batches?.exp_date || null)}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">
                  {Number(r.qty).toLocaleString("id-ID", {
                    maximumFractionDigits: 3,
                  })}{" "}
                  {r.items?.satuan}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">
                  {formatRupiah(Number(r.harga_per_unit))}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {formatRupiah(Number(r.subtotal))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} className="py-2 pr-2 text-right text-neutral-600">
                Sub-Total
              </td>
              <td className="py-2 text-right whitespace-nowrap">
                {formatRupiah(subtotal)}
              </td>
            </tr>
            <tr>
              <td colSpan={7} className="py-1 pr-2 text-right text-neutral-600">
                PPN{" "}
                {Number(retur.receivings?.ppn_percent ?? 0).toLocaleString("id-ID")}%
              </td>
              <td className="py-1 text-right whitespace-nowrap">
                {formatRupiah(ppn)}
              </td>
            </tr>
            <tr className="border-t-2 border-[#1a1a1a]">
              <td colSpan={7} className="py-2 pr-2 text-right font-semibold">
                Total Nilai Retur
              </td>
              <td className="py-2 text-right font-bold whitespace-nowrap">
                {formatRupiah(Number(retur.total_nilai))}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* ===== DAMPAK TAGIHAN ===== */}
        <div className="mt-5 border border-neutral-300 rounded-sm p-3 text-[11.5px]">
          <div className="flex justify-between">
            <span className="text-neutral-600">
              Nilai faktur {retur.receivings?.no_invoice || ""}
            </span>
            <span>
              {formatRupiah(Number(retur.receivings?.total_invoice ?? 0))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600">
              Total retur atas faktur ini
            </span>
            <span>
              − {formatRupiah(Number(retur.receivings?.total_retur ?? 0))}
            </span>
          </div>
          <div className="flex justify-between font-semibold border-t border-neutral-300 mt-1.5 pt-1.5">
            <span>Sisa tagihan yang harus dibayar</span>
            <span>{formatRupiah(sisaTagihan)}</span>
          </div>
        </div>

        {retur.catatan && (
          <div className="mt-4 text-[11.5px]">
            <span className="text-neutral-500">Catatan: </span>
            {retur.catatan}
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

        <div className="mt-10 pt-3 border-t border-neutral-300 text-[10px] text-neutral-400 flex justify-between">
          <span>Nota Retur Pembelian {retur.no_retur}</span>
          <span>{org?.nama}</span>
        </div>
      </div>
    </div>
  );
}
