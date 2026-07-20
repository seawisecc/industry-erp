import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { Wallet, ReceiptText, CalendarClock } from "lucide-react";
import PembelianShell from "@/components/PembelianShell";
import PayButton from "./PayButton";
import TableSearch from "@/components/TableSearch";

type InvoiceRow = {
  id: string;
  no_invoice: string | null;
  tanggal_terima: string;
  supplier_nama: string | null;
  total_invoice: number;
  top_days: number | null;
  jatuh_tempo: string | null;
  status_bayar: string;
  tanggal_bayar: string | null;
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

export default async function PaymentsPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data: invoices } = await supabase
    .from("receivings")
    .select(
      "id, no_invoice, tanggal_terima, supplier_nama, total_invoice, top_days, jatuh_tempo, status_bayar, tanggal_bayar, purchase_orders(no_po)"
    )
    .eq("organization_id", organizationId);

  const todayStr = new Date().toLocaleDateString("sv-SE");
  const list = ((invoices || []) as unknown as InvoiceRow[]).sort((a, b) => {
    // Belum lunas dulu, urut jatuh tempo terdekat (tanpa tempo di akhir)
    if (a.status_bayar !== b.status_bayar)
      return a.status_bayar === "Belum Lunas" ? -1 : 1;
    const ja = a.jatuh_tempo || "9999-12-31";
    const jb = b.jatuh_tempo || "9999-12-31";
    return ja.localeCompare(jb);
  });

  const belumLunas = list.filter((i) => i.status_bayar === "Belum Lunas");
  const totalHutang = belumLunas.reduce((s, i) => s + Number(i.total_invoice), 0);
  const terlambat = belumLunas.filter(
    (i) => i.jatuh_tempo !== null && i.jatuh_tempo < todayStr
  ).length;

  return (
    <PembelianShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">Invoice Payments</h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Faktur pembelian diurutkan berdasarkan jatuh tempo terdekat
        </p>
      </div>

      {/* ===== Kartu ringkasan ===== */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-clay-100 text-clay-600 rounded-lg p-2">
              <Wallet size={16} />
            </div>
            <div className="text-[10.5px] uppercase tracking-wide text-muted font-medium">
              Total Hutang Belum Lunas
            </div>
          </div>
          <div className="font-display text-[21px] font-semibold text-ink mt-2 leading-none">
            {formatRupiah(totalHutang)}
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-amber-100 text-amber-500 rounded-lg p-2">
              <ReceiptText size={16} />
            </div>
            <div className="text-[10.5px] uppercase tracking-wide text-muted font-medium">
              Faktur Belum Lunas
            </div>
          </div>
          <div className="font-display text-[21px] font-semibold text-ink mt-2 leading-none">
            {belumLunas.length}
          </div>
        </div>
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`rounded-lg p-2 ${
                terlambat > 0
                  ? "bg-clay-100 text-clay-600"
                  : "bg-botanical-100 text-botanical-700"
              }`}
            >
              <CalendarClock size={16} />
            </div>
            <div className="text-[10.5px] uppercase tracking-wide text-muted font-medium">
              Lewat Jatuh Tempo
            </div>
          </div>
          <div
            className={`font-display text-[21px] font-semibold mt-2 leading-none ${
              terlambat > 0 ? "text-clay-600" : "text-ink"
            }`}
          >
            {terlambat}
          </div>
        </div>
      </div>

      {/* ===== Tabel faktur ===== */}
      <div className="mt-4">
        <TableSearch
          placeholder="Cari no. PO / supplier..."
          filters={[{ label: "Semua Status", options: ["Lunas", "Belum Lunas"] }]}
        />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No. Faktur</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Supplier</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">PO</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tgl Faktur</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">TOP</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Jatuh Tempo</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Total</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-muted py-10 text-sm">
                  Belum ada faktur — faktur muncul otomatis dari Receiving.
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
                      <div
                        className="max-w-[190px] truncate font-medium"
                        title={inv.supplier_nama || undefined}
                      >
                        {inv.supplier_nama || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                      {inv.purchase_orders?.no_po || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTanggal(inv.tanggal_terima)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                      {inv.top_days == null
                        ? "—"
                        : inv.top_days === 0
                          ? "Tunai"
                          : `${inv.top_days} hr`}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inv.jatuh_tempo ? (
                        <span
                          className={
                            overdue ? "text-clay-600 font-semibold" : undefined
                          }
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
                      {formatRupiah(Number(inv.total_invoice))}
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
                      <PayButton id={inv.id} noInvoice={inv.no_invoice} paid={paid} />
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
