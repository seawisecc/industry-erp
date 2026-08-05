import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { localDateStr } from "@/lib/dates";
import { sisaHutang } from "@/lib/purchaseReturn";
import PurchaseReturnForm, {
  type ReturBatch,
  type ReturFaktur,
} from "../../PurchaseReturnForm";

type RcvRaw = {
  id: string;
  no_invoice: string | null;
  po_id: string | null;
  tanggal_terima: string;
  supplier_nama: string | null;
  ppn_percent: number;
  total_invoice: number;
  total_retur: number;
  purchase_orders: { no_po: string | null } | null;
};

type BatchRaw = {
  id: string;
  item_id: string;
  no_lot_supplier: string | null;
  exp_date: string | null;
  harga_per_unit: number;
  qty_masuk: number;
  qty_sisa: number;
  qty_karantina: number;
  qc_status: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
};

export default async function ReturBaruPage({
  params,
}: {
  params: Promise<{ receivingId: string }>;
}) {
  const { receivingId } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data } = await supabase
    .from("receivings")
    .select(
      "id, no_invoice, po_id, tanggal_terima, supplier_nama, ppn_percent, total_invoice, total_retur, purchase_orders(no_po)"
    )
    .eq("id", receivingId)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const rcv = data as unknown as RcvRaw;

  const kolom =
    "id, item_id, no_lot_supplier, exp_date, harga_per_unit, qty_masuk, qty_sisa, qty_karantina, qc_status, items(kode, nama, satuan)";

  // Data lama belum punya receiving_id: dicocokkan lewat PO + tanggal terima,
  // pola yang sama dengan halaman detail penerimaan. RPC menerima fallback
  // yang sama, jadi batch lama tetap bisa diretur.
  let { data: batches } = await supabase
    .from("purchase_batches")
    .select(kolom)
    .eq("receiving_id", receivingId)
    .eq("organization_id", organizationId);

  if (!batches || batches.length === 0) {
    const fallback = await supabase
      .from("purchase_batches")
      .select(kolom)
      .eq("po_id", rcv.po_id)
      .eq("tanggal_terima", rcv.tanggal_terima)
      .eq("organization_id", organizationId);
    batches = fallback.data;
  }

  const raw = (batches || []) as unknown as BatchRaw[];

  // Batch yang ditolak QC stoknya sudah nol, jadi batas returnya dihitung
  // dari qty diterima dikurangi yang sudah pernah diretur.
  const sudahRetur = new Map<string, number>();
  if (raw.length > 0) {
    const { data: prevItems } = await supabase
      .from("purchase_return_items")
      .select("purchase_batch_id, qty")
      .eq("organization_id", organizationId)
      .in(
        "purchase_batch_id",
        raw.map((b) => b.id)
      );
    for (const r of (prevItems || []) as {
      purchase_batch_id: string;
      qty: number;
    }[]) {
      sudahRetur.set(
        r.purchase_batch_id,
        (sudahRetur.get(r.purchase_batch_id) || 0) + Number(r.qty)
      );
    }
  }

  const returBatches: ReturBatch[] = raw.map((b) => {
    const ditolak = b.qc_status === "Rejected";
    const maks = ditolak
      ? Math.max(Number(b.qty_masuk) - (sudahRetur.get(b.id) || 0), 0)
      : Number(b.qty_karantina || 0) + Number(b.qty_sisa || 0);
    return {
      id: b.id,
      item_nama: b.items?.nama || "(item terhapus)",
      item_kode: b.items?.kode || "-",
      satuan: b.items?.satuan || "",
      no_lot: b.no_lot_supplier,
      exp_date: b.exp_date,
      harga_per_unit: Number(b.harga_per_unit),
      qty_masuk: Number(b.qty_masuk),
      maks,
      qc_status: b.qc_status,
      stokSudahHangus: ditolak,
    };
  });

  const faktur: ReturFaktur = {
    id: rcv.id,
    no_invoice: rcv.no_invoice,
    no_po: rcv.purchase_orders?.no_po ?? null,
    tanggal_terima: rcv.tanggal_terima,
    supplier_nama: rcv.supplier_nama,
    ppn_percent: Number(rcv.ppn_percent || 0),
    total_invoice: Number(rcv.total_invoice),
    total_retur: Number(rcv.total_retur || 0),
    sisa: sisaHutang(Number(rcv.total_invoice), Number(rcv.total_retur || 0)),
  };

  return (
    <div className="max-w-6xl">
      <Link
        href="/purchase-returns/new"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Pilih faktur lain
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Retur Pembelian
      </h1>
      <p className="text-muted text-sm mb-6">
        {faktur.supplier_nama || "-"} · faktur{" "}
        <span className="font-mono">{faktur.no_invoice || "(tanpa nomor)"}</span>
        {faktur.no_po ? ` · PO ${faktur.no_po}` : ""} · sisa tagihan{" "}
        {"Rp " + faktur.sisa.toLocaleString("id-ID", { maximumFractionDigits: 0 })}
      </p>

      <PurchaseReturnForm
        faktur={faktur}
        batches={returBatches}
        hariIni={localDateStr()}
      />
    </div>
  );
}
