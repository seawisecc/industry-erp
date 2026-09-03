import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { Wallet, ReceiptText, CalendarClock, Printer } from "lucide-react";
import SalesShell from "@/components/SalesShell";
import PaymentPanel, { type PaymentRow } from "./PaymentPanel";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import { IconAction } from "@/components/RowActions";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
  orderFor,
} from "@/lib/pagination";
import { localDateStr } from "@/lib/dates";

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

const SORT: Record<string, string> = {
  no: "no_invoice",
  tanggal: "tanggal",
  tempo: "jatuh_tempo",
  total: "total",
};

export default async function SalesPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  // Hapus cicilan setara Batal Transaksi, lihat catatan di actions.ts.
  const canCancel =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_cancel;

  // Yang butuh pelunasan: dokumen belum lunas (Proforma / cicilan berjalan).
  // POS cash sudah lunas seketika → tidak muncul di sini.
  const sp = parseListQuery(await searchParams);
  const ord = orderFor(sp, SORT, { column: "jatuh_tempo", ascending: true });

  // Nama client ada di tabel lain, cari id-nya dulu supaya dokumen tetap
  // bisa dicari lewat nama client, bukan cuma nomor dokumen.
  let clientIds: string[] = [];
  if (sp.q) {
    const { data: cs } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId)
      .or(`kode.ilike."%${sp.q}%",company_brand.ilike."%${sp.q}%"`)
      .limit(500);
    clientIds = (cs || []).map((c) => c.id as string);
  }

  let query = supabase
    .from("sales_invoices")
    .select(
      "id, no_invoice, tipe, sumber, tanggal, total, jatuh_tempo, status_bayar, tanggal_bayar, nama_pembeli, clients(kode, company_brand)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId)
    .eq("status_bayar", "Belum Lunas");

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(
        ["no_invoice", "nama_pembeli"],
        sp.q,
        "client_id",
        clientIds
      )
    );

  const { data: invoices, count } = await query
    .order(ord.column, { ascending: ord.ascending, nullsFirst: false })
    .range(sp.from, sp.to);

  const list = (invoices || []) as unknown as InvRow[];
  const info = pageInfo(sp.page, count, list.length);
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

  const todayStr = localDateStr();
  const dibayarOf = (id: string) =>
    (paysByInv.get(id) || []).reduce((s, p) => s + Number(p.jumlah), 0);
  /** Lewat jatuh tempo, barisnya diberi latar peringatan. */
  const overdueTagihan = (inv: InvRow) =>
    inv.jatuh_tempo !== null && inv.jatuh_tempo < todayStr;

  // Ringkasan piutang harus mencakup SELURUH dokumen belum lunas, bukan
  // cuma halaman yang sedang tampil. Urutan jatuh tempo sudah dikerjakan
  // database, jadi `list` dipakai apa adanya untuk tabel.
  const { data: unpaidAll } = await supabase
    .from("sales_invoices")
    .select("id, total, jatuh_tempo")
    .eq("organization_id", organizationId)
    .eq("status_bayar", "Belum Lunas");
  const unpaid = (unpaidAll || []) as {
    id: string;
    total: number;
    jatuh_tempo: string | null;
  }[];

  const dibayarAll = new Map<string, number>();
  if (unpaid.length > 0) {
    const { data: allPays } = await supabase
      .from("sales_payments")
      .select("invoice_id, jumlah")
      .eq("organization_id", organizationId)
      .in(
        "invoice_id",
        unpaid.map((u) => u.id)
      );
    for (const p of (allPays || []) as {
      invoice_id: string;
      jumlah: number;
    }[]) {
      dibayarAll.set(
        p.invoice_id,
        (dibayarAll.get(p.invoice_id) || 0) + Number(p.jumlah)
      );
    }
  }

  const totalPiutang = unpaid.reduce(
    (s, i) => s + (Number(i.total) - (dibayarAll.get(i.id) || 0)),
    0
  );
  const terlambat = unpaid.filter(
    (i) => i.jatuh_tempo !== null && i.jatuh_tempo < todayStr
  ).length;

  return (
    <SalesShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Sales Payments
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          Tagihan Proforma menunggu pelunasan. Catat DP/cicilan, lunas otomatis
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
            value: unpaid.length.toLocaleString("id-ID"),
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
        <TableToolbar placeholder="Cari no. dokumen / client..." info={info} />
      </div>
      <DataTable
        rows={list}
        rowKey={(inv) => inv.id}
        minWidth={960}
        rowClassName={(inv) =>
          overdueTagihan(inv) ? "bg-clay-100/30 align-top" : "align-top"
        }
        empty={
          sp.q
            ? "Tidak ada dokumen yang cocok dengan pencarian."
            : "Tidak ada tagihan menunggu pelunasan 🎉"
        }
        columns={[
          {
            key: "no",
            header: "No. PI",
            sort: "no",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (inv) => {
              const adaDp = dibayarOf(inv.id) > 0;
              return (
                <span className="font-mono text-[12px]">
                  {inv.no_invoice || "-"}
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
                </span>
              );
            },
            cardCell: (inv) => (
              <span className="font-mono text-[12px] font-normal">
                {inv.no_invoice || "-"}
              </span>
            ),
          },
          {
            key: "client",
            header: "Client",
            role: "title",
            cell: (inv) => (
              <div className="max-w-[170px] truncate font-medium">
                {inv.clients?.company_brand || inv.nama_pembeli || "-"}
              </div>
            ),
            cardCell: (inv) =>
              inv.clients?.company_brand || inv.nama_pembeli || "-",
          },
          {
            key: "tanggal",
            header: "Tanggal",
            sort: "tanggal",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (inv) => formatTanggal(inv.tanggal),
          },
          {
            key: "tempo",
            header: "Jatuh Tempo",
            sort: "tempo",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (inv) =>
              inv.jatuh_tempo ? (
                <span
                  className={
                    overdueTagihan(inv) ? "text-clay-600 font-semibold" : undefined
                  }
                >
                  {formatTanggal(inv.jatuh_tempo)}
                  {overdueTagihan(inv) && (
                    <span className="block text-[10.5px] font-medium">
                      terlambat
                    </span>
                  )}
                </span>
              ) : (
                "-"
              ),
          },
          {
            key: "total",
            header: "Total",
            sort: "total",
            role: "secondary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (inv) => formatRupiah(Number(inv.total)),
          },
          {
            key: "dibayar",
            header: "Dibayar",
            role: "secondary",
            align: "right",
            className: "whitespace-nowrap text-botanical-700 font-medium",
            cell: (inv) => (
              <span className="text-botanical-700 font-medium">
                {formatRupiah(dibayarOf(inv.id))}
              </span>
            ),
          },
          {
            key: "sisa",
            header: "Sisa",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap font-semibold text-clay-600",
            cell: (inv) => (
              <span className="font-semibold text-clay-600">
                {formatRupiah(Number(inv.total) - dibayarOf(inv.id))}
              </span>
            ),
          },
          {
            key: "aksi",
            header: "Aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (inv) => (
              <div className="flex items-center justify-end gap-1 md:gap-1.5">
                <IconAction
                  icon={Printer}
                  label="Cetak proforma"
                  href={`/print/invoice/${inv.id}`}
                  tone="primary"
                />
                <PaymentPanel
                  invoiceId={inv.id}
                  noInvoice={inv.no_invoice}
                  client={inv.clients?.company_brand || inv.nama_pembeli || "-"}
                  total={Number(inv.total)}
                  payments={paysByInv.get(inv.id) || []}
                  canCancel={canCancel}
                />
              </div>
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </SalesShell>
  );
}
