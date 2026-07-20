import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";
import SalesShell from "@/components/SalesShell";
import TableSearch from "@/components/TableSearch";

type ConsRow = {
  id: string;
  no_konsinyasi: string | null;
  tanggal_kirim: string;
  status: string;
  clients: { company_brand: string } | null;
  consignment_items: { qty_kirim: number; qty_terjual: number; qty_retur: number }[];
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ConsignmentsPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: cons } = await supabase
    .from("consignments")
    .select(
      "id, no_konsinyasi, tanggal_kirim, status, clients(company_brand), consignment_items(qty_kirim, qty_terjual, qty_retur)"
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  const list = (cons || []) as unknown as ConsRow[];

  return (
    <SalesShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Consignment</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {list.length} pengiriman konsinyasi — lapor laku → proforma invoice
          </p>
        </div>
        <Link
          href="/consignments/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Kirim Konsinyasi
        </Link>
      </div>

      <div className="mt-4">
        <TableSearch
          placeholder="Cari no. konsinyasi / client..."
          filters={[{ label: "Semua Status", options: ["Aktif", "Selesai"] }]}
        />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[800px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No.</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Client</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tanggal Kirim</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Terkirim</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Terjual</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Sisa di Lokasi</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-10 text-sm">
                  Belum ada konsinyasi.
                </td>
              </tr>
            ) : (
              list.map((c) => {
                const kirim = c.consignment_items.reduce(
                  (s, i) => s + Number(i.qty_kirim),
                  0
                );
                const terjual = c.consignment_items.reduce(
                  (s, i) => s + Number(i.qty_terjual),
                  0
                );
                const retur = c.consignment_items.reduce(
                  (s, i) => s + Number(i.qty_retur),
                  0
                );
                const sisa = kirim - terjual - retur;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                      {c.no_konsinyasi}
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[200px] truncate font-medium">
                        {c.clients?.company_brand || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTanggal(c.tanggal_kirim)}
                    </td>
                    <td className="px-4 py-3 text-right">{kirim.toLocaleString("id-ID")}</td>
                    <td className="px-4 py-3 text-right text-botanical-700 font-medium">
                      {terjual.toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3 text-right">{sisa.toLocaleString("id-ID")}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                          c.status === "Aktif"
                            ? "bg-amber-100 text-amber-500"
                            : "bg-botanical-100 text-botanical-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/consignments/${c.id}`}
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
    </SalesShell>
  );
}
