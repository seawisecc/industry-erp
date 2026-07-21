import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Wand2 } from "lucide-react";
import PembelianShell from "@/components/PembelianShell";
import TableSearch from "@/components/TableSearch";

type POStatus = "Dibuat" | "Disetujui" | "Dikirim" | "Diterima Sebagian" | "Selesai";

type PORow = {
  id: string;
  no_po: string | null;
  tanggal_po: string;
  status: POStatus;
  ppn_percent: number;
  top_days: number | null;
  suppliers: { nama: string } | null;
  po_items: { qty_pesan: number; harga_per_unit: number }[];
};

const STATUS_STYLE: Record<POStatus, string> = {
  Dibuat: "bg-white/70 text-muted border border-line",
  Disetujui: "bg-amber-100 text-amber-500",
  Dikirim: "bg-clay-100 text-clay-600",
  "Diterima Sebagian": "bg-botanical-100 text-botanical-700",
  Selesai: "bg-botanical-700 text-white",
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

export default async function PurchaseOrdersPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: pos } = await supabase
    .from("purchase_orders")
    .select(
      "id, no_po, tanggal_po, status, ppn_percent, top_days, suppliers(nama), po_items(qty_pesan, harga_per_unit)"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const list = (pos || []) as unknown as PORow[];

  return (
    <PembelianShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Purchase Orders
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {list.length} PO — alur: Dibuat → Disetujui → Dikirim → Diterima
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/purchase-orders/guide"
            className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <Wand2 size={14} /> Guide Order
          </Link>
          <Link
            href="/purchase-orders/new"
            className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={15} /> Buat PO
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <TableSearch
          placeholder="Cari no. PO / supplier..."
          filters={[{ label: "Semua Status", options: ["Dibuat", "Disetujui", "Dikirim", "Diterima Sebagian", "Selesai"] }]}
        />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[960px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No. PO</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Supplier</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Item</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Total (incl. PPN)</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">TOP</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-10 text-sm">
                  Belum ada Purchase Order.
                </td>
              </tr>
            ) : (
              list.map((po) => {
                const subtotal = po.po_items.reduce(
                  (s, r) => s + Number(r.qty_pesan) * Number(r.harga_per_unit),
                  0
                );
                const total = subtotal * (1 + Number(po.ppn_percent) / 100);
                const editable = po.status === "Dibuat";
                return (
                  <tr
                    key={po.id}
                    className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[12.5px]">
                      {po.no_po || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTanggal(po.tanggal_po)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[220px] truncate font-medium">
                        {po.suppliers?.nama || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">{po.po_items.length}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatRupiah(total)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                      {po.top_days == null
                        ? "—"
                        : po.top_days === 0
                          ? "Tunai"
                          : `${po.top_days} hr`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium whitespace-nowrap ${STATUS_STYLE[po.status]}`}
                      >
                        {po.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/print/po/${po.id}`}
                        className="text-muted text-[12.5px] font-medium hover:underline mr-3"
                      >
                        Cetak
                      </Link>
                      <Link
                        href={`/purchase-orders/${po.id}/edit`}
                        className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        {editable ? "Edit" : "Detail"}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </PembelianShell>
  );
}
