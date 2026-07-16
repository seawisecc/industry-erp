import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { Wallet, ReceiptText, CalendarClock } from "lucide-react";
import SalesShell from "@/components/SalesShell";
import SalesPayButton from "./SalesPayButton";

type InvRow = {
  id: string;
  no_invoice: string | null;
  tipe: string;
  sumber: string;
  tanggal: string;
  total: number;
  jatuh_tempo: string | null;
  status_bayar: string;
  tanggal_bayar: string | null;
  nama_pembeli: string | null;
  clients: { kode: string | null; company_brand: string } | null;
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

export default async function SalesPaymentsPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: invoices } = await supabase
    .from("sales_invoices")
    .select(
      "id, no_invoice, tipe, sumber, tanggal, total, jatuh_tempo, status_bayar, tanggal_bayar, nama_pembeli, clients(kode, company_brand)"
    )
    .eq("organization_id", organizationId)
    .eq("tipe", "Invoice");

  const todayStr = new Date().toISOString().slice(0, 10);
  const list = ((invoices || []) as unknown as InvRow[]).sort((a, b) => {
    if (a.status_bayar !== b.status_bayar)
      return a.status_bayar === "Belum Lunas" ? -1 : 1;
    return (a.jatuh_tempo || "9999").localeCompare(b.jatuh_tempo || "9999");
  });

  const belum = list.filter((i) => i.status_bayar === "Belum Lunas");
  const totalPiutang = belum.reduce((s, i) => s + Number(i.total), 0);
  const terlambat = belum.filter(
    (i) => i.jatuh_tempo !== null && i.jatuh_tempo < todayStr
  ).length;

  return (
    <SalesShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Sales Payments
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Piutang penjualan (konsinyasi, invoice, POS) — urut jatuh tempo terdekat
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            icon: Wallet,
            label: "Total Piutang",
            value: formatRupiah(totalPiutang),
            tone: "bg-clay-100 text-clay-600",
          },
          {
            icon: ReceiptText,
            label: "Invoice Belum Lunas",
            value: String(belum.length),
            tone: "bg-amber-100 text-amber-500",
          },
          {
            icon: CalendarClock,
            label: "Lewat Jatuh Tempo",
            value: String(terlambat),
            tone:
              terlambat > 0
                ? "bg-clay-100 text-clay-600"
                : "bg-botanical-100 text-botanical-700",
          },
        ].map((c) => (
          <div key={c.label} className="glass rounded-2xl p-4">
            <div className="flex items-center gap-2.5">
              <div className={`rounded-lg p-2 ${c.tone}`}>
                <c.icon size={16} />
              </div>
              <div className="text-[10.5px] uppercase tracking-wide text-muted font-medium">
                {c.label}
              </div>
            </div>
            <div className="font-display text-[21px] font-semibold text-ink mt-2 leading-none">
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">No. Invoice</th>
              <th className="px-4 py-2.5 font-semibold">Client</th>
              <th className="px-4 py-2.5 font-semibold">Sumber</th>
              <th className="px-4 py-2.5 font-semibold">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold">Jatuh Tempo</th>
              <th className="px-4 py-2.5 font-semibold text-right">Total</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-10 text-sm">
                  Belum ada invoice penjualan — muncul otomatis dari Consignment,
                  Invoices, dan POS.
                </td>
              </tr>
            ) : (
              list.map((inv) => {
                const paid = inv.status_bayar === "Lunas";
                const overdue =
                  !paid && inv.jatuh_tempo !== null && inv.jatuh_tempo < todayStr;
                return (
                  <tr
                    key={inv.id}
                    className={`border-b border-line last:border-0 transition-colors ${
                      overdue ? "bg-clay-100/30" : "hover:bg-white/40"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                      {inv.no_invoice || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[190px] truncate font-medium">
                        {inv.clients?.company_brand || inv.nama_pembeli || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                      {inv.sumber}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTanggal(inv.tanggal)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inv.jatuh_tempo ? (
                        <span
                          className={overdue ? "text-clay-600 font-semibold" : undefined}
                        >
                          {formatTanggal(inv.jatuh_tempo)}
                          {overdue && (
                            <span className="block text-[10.5px] font-medium">
                              terlambat
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatRupiah(Number(inv.total))}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          paid
                            ? "bg-botanical-100 text-botanical-700"
                            : "bg-amber-100 text-amber-500"
                        }`}
                      >
                        {paid ? "Lunas" : "Belum Lunas"}
                      </span>
                      {paid && inv.tanggal_bayar && (
                        <div className="text-[10.5px] text-muted mt-0.5">
                          {formatTanggal(inv.tanggal_bayar)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <SalesPayButton
                        id={inv.id}
                        noInvoice={inv.no_invoice}
                        paid={paid}
                      />
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
