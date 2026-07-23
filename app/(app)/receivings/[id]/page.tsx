import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import CancelTxButton from "@/components/CancelTxButton";
import { cancelReceiving } from "../actions";

type RcvDetail = {
  id: string;
  no_invoice: string | null;
  tanggal_terima: string;
  supplier_nama: string | null;
  ppn_percent: number;
  subtotal: number;
  total_ppn: number;
  total_invoice: number;
  top_days: number | null;
  jatuh_tempo: string | null;
  status_bayar: string;
  po_id: string | null;
  purchase_orders: { no_po: string | null } | null;
};

type BatchRow = {
  qty_masuk: number;
  harga_per_unit: number;
  no_lot_supplier: string | null;
  exp_date: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
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

export default async function ReceivingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const canCancel =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_cancel;

  const { data } = await supabase
    .from("receivings")
    .select(
      "id, no_invoice, tanggal_terima, supplier_nama, ppn_percent, subtotal, total_ppn, total_invoice, top_days, jatuh_tempo, status_bayar, po_id, purchase_orders(no_po)"
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const rcv = data as unknown as RcvDetail;

  // Batch milik penerimaan ini (data lama tanpa receiving_id: fallback po+tanggal)
  let { data: batches } = await supabase
    .from("purchase_batches")
    .select("qty_masuk, harga_per_unit, no_lot_supplier, exp_date, items(kode, nama, satuan)")
    .eq("receiving_id", id);

  if (!batches || batches.length === 0) {
    const fallback = await supabase
      .from("purchase_batches")
      .select("qty_masuk, harga_per_unit, no_lot_supplier, exp_date, items(kode, nama, satuan)")
      .eq("po_id", rcv.po_id)
      .eq("tanggal_terima", rcv.tanggal_terima)
      .eq("organization_id", organizationId);
    batches = fallback.data;
  }

  const rows = (batches || []) as unknown as BatchRow[];

  return (
    <div className="max-w-3xl">
      <Link
        href="/receivings"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Receiving
      </Link>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Penerimaan{" "}
          <span className="font-mono text-[20px]">
            {rcv.no_invoice || rcv.purchase_orders?.no_po || ""}
          </span>
        </h1>
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
            rcv.status_bayar === "Lunas"
              ? "bg-botanical-100 text-botanical-700"
              : "bg-amber-100 text-amber-500"
          }`}
        >
          {rcv.status_bayar}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <CancelTxButton
            id={rcv.id}
            action={cancelReceiving}
            canCancel={canCancel}
            label="Batal Penerimaan"
            judul="Batalkan Penerimaan"
            keterangan="Stok yang masuk dari penerimaan ini akan dihapus dan status PO dikembalikan. Hanya bisa bila barangnya belum terpakai."
            redirectTo="/receivings"
          />
          <Link
            href={`/print/receiving/${rcv.id}`}
            className="flex items-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium px-3.5 py-2 rounded-lg hover:bg-botanical-800 transition-colors"
          >
            <Printer size={15} /> Cetak
          </Link>
        </div>
      </div>
      <p className="text-muted text-sm mb-6">
        {formatTanggal(rcv.tanggal_terima)} — {rcv.supplier_nama || "—"}
      </p>

      <div className="glass rounded-2xl p-6 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13.5px]">
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">No. PO</div>
          <div className="font-mono text-[12.5px]">{rcv.purchase_orders?.no_po || "—"}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
            No. Invoice
          </div>
          <div className="font-mono text-[12.5px]">{rcv.no_invoice || "—"}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">TOP</div>
          <div>
            {rcv.top_days == null
              ? "—"
              : rcv.top_days === 0
                ? "Tunai / CIA"
                : `${rcv.top_days} hari`}
          </div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
            Jatuh Tempo
          </div>
          <div>{rcv.jatuh_tempo ? formatTanggal(rcv.jatuh_tempo) : "—"}</div>
        </div>
      </div>

      <div className="glass rounded-2xl overflow-x-auto mb-5">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Item</th>
              <th className="px-4 py-2.5 font-semibold">Lot Supplier</th>
              <th className="px-4 py-2.5 font-semibold">Exp</th>
              <th className="px-4 py-2.5 font-semibold text-right">Qty</th>
              <th className="px-4 py-2.5 font-semibold text-right">Harga/Unit</th>
              <th className="px-4 py-2.5 font-semibold text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <span className="font-mono text-[11.5px] text-botanical-700 mr-2">
                    {r.items?.kode}
                  </span>
                  {r.items?.nama}
                </td>
                <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                  {r.no_lot_supplier || "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                  {r.exp_date
                    ? new Date(r.exp_date + "T00:00:00").toLocaleDateString("id-ID", {
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {Number(r.qty_masuk).toLocaleString("id-ID")} {r.items?.satuan}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {formatRupiah(Number(r.harga_per_unit))}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {formatRupiah(Number(r.qty_masuk) * Number(r.harga_per_unit))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="glass rounded-2xl p-6 flex flex-col gap-2 sm:max-w-sm sm:ml-auto text-[13.5px]">
        <div className="flex justify-between">
          <span className="text-muted">Subtotal</span>
          <span>{formatRupiah(Number(rcv.subtotal))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">PPN {Number(rcv.ppn_percent)}%</span>
          <span>{formatRupiah(Number(rcv.total_ppn))}</span>
        </div>
        <div className="flex justify-between font-semibold text-[15px] border-t border-line pt-2 mt-1">
          <span>Total Invoice</span>
          <span>{formatRupiah(Number(rcv.total_invoice))}</span>
        </div>
      </div>
    </div>
  );
}
