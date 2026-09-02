import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { Wallet, ReceiptText, CalendarClock } from "lucide-react";
import PembelianShell from "@/components/PembelianShell";
import PayButton from "./PayButton";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import DataTable from "@/components/DataTable";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
  orderFor,
} from "@/lib/pagination";
import { localDateStr } from "@/lib/dates";
import { sisaHutang } from "@/lib/purchaseReturn";

type InvoiceRow = {
  id: string;
  no_invoice: string | null;
  tanggal_terima: string;
  supplier_nama: string | null;
  total_invoice: number;
  total_retur: number | null;
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

const SORT: Record<string, string> = {
  no: "no_invoice",
  supplier: "supplier_nama",
  tgl: "tanggal_terima",
  top: "top_days",
  tempo: "jatuh_tempo",
  total: "total_invoice",
  retur: "total_retur",
  status: "status_bayar",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  const ord = orderFor(sp, SORT, { column: "status_bayar", ascending: true });
  const todayStr = localDateStr();

  // No. PO ada di tabel purchase_orders, cari id-nya dulu supaya
  // pencarian lewat no. PO tetap jalan.
  let poIds: string[] = [];
  if (sp.q) {
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("no_po", `%${sp.q}%`)
      .limit(500);
    poIds = (pos || []).map((p) => p.id as string);
  }

  let query = supabase
    .from("receivings")
    .select(
      "id, no_invoice, tanggal_terima, supplier_nama, total_invoice, total_retur, top_days, jatuh_tempo, status_bayar, tanggal_bayar, purchase_orders(no_po)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(["no_invoice", "supplier_nama"], sp.q, "po_id", poIds)
    );
  if (sp.filter("status"))
    query = query.eq("status_bayar", sp.filter("status"));

  // Urutan lama (belum lunas dulu, lalu jatuh tempo terdekat) dipindah ke
  // database, kalau tetap di JS, urutannya cuma benar dalam satu halaman.
  // "Belum Lunas" < "Lunas" secara alfabet, jadi ascending sudah tepat.
  const { data: invoices, count } = await query
    .order(ord.column, { ascending: ord.ascending, nullsFirst: false })
    // Penyeimbang urutan bawaan: yang belum lunas dulu, lalu jatuh tempo
    // terdekat. Tidak mengganggu waktu kolom lain yang disortir.
    .order("jatuh_tempo", { ascending: true, nullsFirst: false })
    .range(sp.from, sp.to);

  const list = (invoices || []) as unknown as InvoiceRow[];
  const info = pageInfo(sp.page, count, list.length);

  /** Lewat jatuh tempo dan belum dibayar, barisnya diberi latar peringatan. */
  const overdueFaktur = (inv: InvoiceRow) =>
    inv.status_bayar !== "Lunas" &&
    inv.jatuh_tempo !== null &&
    inv.jatuh_tempo < todayStr;

  // Ringkasan hutang dihitung dari SELURUH faktur belum lunas, bukan cuma
  // halaman yang sedang tampil.
  const { data: unpaid } = await supabase
    .from("receivings")
    .select("total_invoice, total_retur, jatuh_tempo")
    .eq("organization_id", organizationId)
    .eq("status_bayar", "Belum Lunas");
  // Retur ke supplier memotong tagihan, jadi hutangnya sisa setelah retur.
  // Faktur yang seluruh barangnya dikembalikan tidak dihitung lagi.
  const belumLunas = ((unpaid || []) as {
    total_invoice: number;
    total_retur: number | null;
    jatuh_tempo: string | null;
  }[])
    .map((i) => ({
      ...i,
      sisa: sisaHutang(Number(i.total_invoice), Number(i.total_retur || 0)),
    }))
    .filter((i) => i.sisa > 0.5);
  const totalHutang = belumLunas.reduce((s, i) => s + i.sisa, 0);
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
        <TableToolbar
          placeholder="Cari no. PO / supplier..."
          info={info}
          filters={[
            {
              param: "status",
              label: "Semua Status",
              options: [
                { value: "Lunas", label: "Lunas" },
                { value: "Belum Lunas", label: "Belum Lunas" },
              ],
            },
          ]}
        />
      </div>
      <DataTable
        rows={list}
        rowKey={(inv) => inv.id}
        minWidth={900}
        rowClassName={(inv) => (overdueFaktur(inv) ? "bg-clay-100/30" : "")}
        empty={
          sp.q || sp.filter("status")
            ? "Tidak ada faktur yang cocok dengan pencarian/filter."
            : "Belum ada faktur. Faktur muncul otomatis dari Receiving."
        }
        columns={[
          {
            key: "no",
            header: "No. Faktur",
            sort: "no",
            role: "subtitle",
            className: "whitespace-nowrap",
            cell: (inv) => (
              <span className="font-mono text-[12px]">{inv.no_invoice || "-"}</span>
            ),
          },
          {
            key: "supplier",
            header: "Supplier",
            sort: "supplier",
            role: "title",
            cell: (inv) => (
              <div
                className="max-w-[190px] truncate font-medium"
                title={inv.supplier_nama || undefined}
              >
                {inv.supplier_nama || "-"}
              </div>
            ),
            cardCell: (inv) => inv.supplier_nama || "-",
          },
          {
            key: "po",
            header: "PO",
            cardLabel: "No. PO",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (inv) => (
              <span className="font-mono text-[12px]">
                {inv.purchase_orders?.no_po || "-"}
              </span>
            ),
          },
          {
            key: "tgl",
            header: "Tgl Faktur",
            sort: "tgl",
            role: "secondary",
            className: "whitespace-nowrap",
            cell: (inv) => formatTanggal(inv.tanggal_terima),
          },
          {
            key: "top",
            header: "TOP",
            sort: "top",
            cardLabel: "Termin (TOP)",
            role: "secondary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (inv) =>
              inv.top_days == null
                ? "-"
                : inv.top_days === 0
                  ? "Tunai"
                  : `${inv.top_days} hr`,
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
                    overdueFaktur(inv) ? "text-clay-600 font-semibold" : undefined
                  }
                >
                  {formatTanggal(inv.jatuh_tempo)}
                  {overdueFaktur(inv) && (
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
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (inv) => formatRupiah(Number(inv.total_invoice)),
          },
          {
            key: "retur",
            header: "Retur",
            sort: "retur",
            role: "secondary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (inv) =>
              Number(inv.total_retur || 0) > 0 ? (
                <span className="text-clay-600 font-medium">
                  − {formatRupiah(Number(inv.total_retur))}
                </span>
              ) : (
                <span className="text-muted">-</span>
              ),
          },
          {
            key: "sisa",
            header: "Sisa Bayar",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap font-semibold",
            cell: (inv) =>
              formatRupiah(
                sisaHutang(Number(inv.total_invoice), Number(inv.total_retur || 0))
              ),
          },
          {
            key: "status",
            header: "Status",
            sort: "status",
            role: "badge",
            cell: (inv) => {
              const paid = inv.status_bayar === "Lunas";
              return (
                <>
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
                </>
              );
            },
          },
          {
            key: "aksi",
            header: "Aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (inv) => (
              <PayButton
                id={inv.id}
                noInvoice={inv.no_invoice}
                paid={inv.status_bayar === "Lunas"}
              />
            ),
          },
        ]}
      />
      <Pagination info={info} />
    </PembelianShell>
  );
}
