import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";

type ReceivingRow = {
  id: string;
  tanggal_terima: string;
  no_invoice: string | null;
  supplier_nama: string | null;
  total_invoice: number;
  purchase_orders: { no_po: string | null } | null;
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

export default async function ReceivingsPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: receivings } = await supabase
    .from("receivings")
    .select(
      "id, tanggal_terima, no_invoice, supplier_nama, total_invoice, purchase_orders(no_po)"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const list = (receivings || []) as unknown as ReceivingRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Receiving</h1>
          <p className="text-muted text-sm mt-1">
            {list.length} penerimaan — stok bertambah lewat halaman ini
          </p>
        </div>
        <Link
          href="/receivings/new"
          className="flex items-center gap-1.5 bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-sm hover:bg-botanical-800 transition-colors"
        >
          <Plus size={16} /> Terima Barang
        </Link>
      </div>

      <div className="mt-6 glass rounded-2xl overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold">No. PO</th>
              <th className="px-4 py-2.5 font-semibold">No. Invoice</th>
              <th className="px-4 py-2.5 font-semibold">Supplier</th>
              <th className="px-4 py-2.5 font-semibold text-right">Total Invoice</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted py-10 text-sm">
                  Belum ada penerimaan barang.
                </td>
              </tr>
            ) : (
              list.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatTanggal(r.tanggal_terima)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12.5px]">
                    {r.purchase_orders?.no_po || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12.5px]">
                    {r.no_invoice || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[220px] truncate font-medium">
                      {r.supplier_nama || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatRupiah(Number(r.total_invoice))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
