import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getSalesOptions } from "@/lib/salesOptions";
import Link from "next/link";
import SalesShell from "@/components/SalesShell";
import InvoiceForm from "../sales-invoices/InvoiceForm";

type PosRow = {
  id: string;
  no_invoice: string | null;
  tanggal: string;
  total: number;
  nama_pembeli: string | null;
  clients: { company_brand: string } | null;
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default async function PosPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const { clients, options } = await getSalesOptions(organizationId!, { includeServices: true });

  const todayStr = new Date().toLocaleDateString("sv-SE");
  const { data: todaySales } = await supabase
    .from("sales_invoices")
    .select("id, no_invoice, tanggal, total, nama_pembeli, clients(company_brand)")
    .eq("organization_id", organizationId)
    .eq("sumber", "POS")
    .eq("tanggal", todayStr)
    .order("created_at", { ascending: false });

  const list = (todaySales || []) as unknown as PosRow[];
  const totalHariIni = list.reduce((s, r) => s + Number(r.total), 0);

  return (
    <SalesShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">POS</h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Penjualan cepat walk-in &amp; event — langsung lunas, stok terpotong,
          bisa cetak struk/invoice
        </p>
      </div>

      <div className="mt-4">
        <InvoiceForm clients={clients} options={options} mode="pos" />
      </div>

      {/* ===== Penjualan hari ini ===== */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display text-[15px] font-semibold text-ink">
            Penjualan Hari Ini
          </h3>
          <span className="text-[13px] font-semibold text-botanical-700">
            {formatRupiah(totalHariIni)}
          </span>
        </div>
        <div className="glass rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
                <th className="px-4 py-2.5 font-semibold">No.</th>
                <th className="px-4 py-2.5 font-semibold">Pembeli</th>
                <th className="px-4 py-2.5 font-semibold text-right">Total</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted py-8 text-sm">
                    Belum ada penjualan hari ini.
                  </td>
                </tr>
              ) : (
                list.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-[12px]">{r.no_invoice}</td>
                    <td className="px-4 py-3">
                      {r.clients?.company_brand || r.nama_pembeli || "Walk-in"}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatRupiah(Number(r.total))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/print/invoice/${r.id}`}
                        className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        Cetak
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SalesShell>
  );
}
