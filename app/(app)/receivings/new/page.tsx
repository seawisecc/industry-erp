import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ReceivingForm, { POOption } from "../ReceivingForm";

type PORaw = {
  id: string;
  no_po: string | null;
  status: "Dikirim" | "Diterima Sebagian";
  ppn_percent: number;
  suppliers: { nama: string } | null;
  po_items: {
    id: string;
    item_id: string;
    qty_pesan: number;
    qty_diterima: number;
    harga_per_unit: number;
    items: { kode: string; nama: string; satuan: string } | null;
  }[];
};

export default async function NewReceivingPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: pos } = await supabase
    .from("purchase_orders")
    .select(
      "id, no_po, status, ppn_percent, suppliers(nama), po_items(id, item_id, qty_pesan, qty_diterima, harga_per_unit, items(kode, nama, satuan))"
    )
    .eq("organization_id", organizationId)
    .neq("status", "Selesai")
    .order("created_at", { ascending: false });

  const options: POOption[] = ((pos || []) as unknown as PORaw[]).map((po) => ({
    id: po.id,
    no_po: po.no_po,
    status: po.status,
    ppn_percent: Number(po.ppn_percent),
    supplier_nama: po.suppliers?.nama || "—",
    items: po.po_items.map((it) => ({
      po_item_id: it.id,
      item_id: it.item_id,
      kode: it.items?.kode || "",
      nama: it.items?.nama || "",
      satuan: it.items?.satuan || "",
      qty_pesan: Number(it.qty_pesan),
      qty_diterima: Number(it.qty_diterima),
      harga_per_unit: Number(it.harga_per_unit),
    })),
  }));

  return (
    <div className="max-w-3xl">
      <Link
        href="/receivings"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Receiving
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Terima Barang
      </h1>
      <p className="text-muted text-sm mb-6">
        Hanya PO yang belum Selesai yang bisa dipilih. Stok bertambah setelah
        penerimaan disimpan.
      </p>

      {options.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-muted text-sm">
          Tidak ada PO yang menunggu barang.{" "}
          <Link href="/purchase-orders/new" className="text-botanical-700 font-medium hover:underline">
            Buat PO dulu
          </Link>
          .
        </div>
      ) : (
        <ReceivingForm pos={options} />
      )}
    </div>
  );
}
