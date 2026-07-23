import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Wallet, ReceiptText, CalendarClock, Printer } from "lucide-react";
import SalesShell from "@/components/SalesShell";
import PaymentPanel, { type PaymentRow } from "./PaymentPanel";
import TableSearch from "@/components/TableSearch";

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
  return "Rp " + Math.round(n).toLocaleString("id-ID");
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

  // Yang butuh pelunasan: dokumen belum lunas (Proforma / cicilan berjalan).
  // POS cash sudah lunas seketika → tidak muncul di sini.
  const { data: invoices } = await supabase
    .from("sales_invoices")
    .select(
      "id, no_invoice, tipe, sumber, tanggal, total, jatuh_tempo, status_bayar, tanggal_bayar, nama_pembeli, clients(kode, company_brand)"
    )
    .eq("organization_id", organizationId)
    .eq("status_bayar", "Belum Lunas");

  const list = (invoices || []) as unknown as InvRow[];
  const ids = list.map((i) => i.id);

  // Ambil semua cicilan untuk dokumen di atas dalam satu query
  const paysByInv = new Map<string, PaymentRow[]>();
  if (ids.length > 0) {
    const { data: pays } = await supabase
      .from("sales_payments")
      .select("id, invoice_id, tanggal, jumlah, catatan")
      .eq("organization_id", organizationId)
      .in("invoice_id", ids)
      .order("tanggal", { ascending: true });
    for (const p of (pays || []) as (PaymentRow & { invoice_id: string })[]) {
      const arr = paysByInv.get(p.invoice_id) || [];
      arr.push({ id: p.id, tanggal: p.tanggal, jumlah: p.jumlah, catatan: p.catatan });
      paysByInv.set(p.invoice_id, arr);
    }
  }

  const todayStr = new Date().toLocaleDateString("sv-SE");
  const dibayarOf = (id: string) =>
    (paysByInv.get(id) || []).reduce((s, p) => s + Number(p.jumlah), 0);

  const sorted = list.sort(
    (a, b) => (a.jatuh_tempo || "9999").localeCompare(b.jatuh_tempo || "9999")
  );

  const totalPiutang = sorted.reduce(
    (s, i) => s + (Number(i.total) - dibayarOf(i.id)),
    0
  );
  const terlambat = sorted.filter(
    (i) => i.jatuh_tempo !== null && i.jatuh_tempo < todayStr
  ).length;

  return (
    <SalesShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Sales Payments
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Tagihan Proforma menunggu pelunasan — catat DP/cicilan, lunas otomatis
          jadi Invoice. POS cash tidak muncul di sini.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            icon: Wallet,
            label: "Sisa Piutang",
            value: formatRupiah(totalPiutang),
            tone: "bg-clay-100 text-clay-600",
          },
          {
            icon: ReceiptText,
            label: "Dokumen Menunggu Bayar",
            value: String(sorted.length),
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

      <div className="mt-4">
        <TableSearch placeholder="Cari no. dokumen / client..." />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[960px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No. PI</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Client</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Jatuh Tempo</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Total</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Dibayar</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Sisa</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-10 text-sm">
                  Tidak ada tagihan menunggu pelunasan 🎉
                </td>
              </tr>
            ) : (
              sorted.map((inv) => {
                const dibayar = dibayarOf(inv.id);
                const sisa = Number(inv.total) - dibayar;
                const overdue =
                  inv.jatuh_tempo !== null && inv.jatuh_tempo < todayStr;
                const adaDp = dibayar > 0;
                return (
                  <tr
                    key={inv.id}
                    className={`border-b border-line last:border-0 align-top transition-colors ${
                      overdue ? "bg-clay-100/30" : "hover:bg-white/40"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                      {inv.no_invoice || "—"}
                      <span className="block mt-1">
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                            adaDp
                              ? "bg-amber-100 text-amber-500"
                              : "bg-white/60 text-muted"
                          }`}
                        >
                          {adaDp ? "DP sebagian" : "Belum bayar"}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[170px] truncate font-medium">
                        {inv.clients?.company_brand || inv.nama_pembeli || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTanggal(inv.tanggal)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {inv.jatuh_tempo ? (
                        <span className={overdue ? "text-clay-600 font-semibold" : undefined}>
                          {formatTanggal(inv.jatuh_tempo)}
                          {overdue && (
                            <span className="block text-[10.5px] font-medium">terlambat</span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatRupiah(Number(inv.total))}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-botanical-700 font-medium">
                      {formatRupiah(dibayar)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-clay-600">
                      {formatRupiah(sisa)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/print/invoice/${inv.id}`}
                          className="inline-flex items-center gap-1 text-botanical-700 text-[11.5px] font-medium hover:underline"
                        >
                          <Printer size={12} /> Cetak
                        </Link>
                        <PaymentPanel
                          invoiceId={inv.id}
                          noInvoice={inv.no_invoice}
                          client={inv.clients?.company_brand || inv.nama_pembeli || "—"}
                          total={Number(inv.total)}
                          payments={paysByInv.get(inv.id) || []}
                        />
                      </div>
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
