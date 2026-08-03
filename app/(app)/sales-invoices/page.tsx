import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";
import SalesShell from "@/components/SalesShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import CancelTxButton from "@/components/CancelTxButton";
import { cancelInvoice } from "./actions";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";

type InvRow = {
  id: string;
  no_invoice: string | null;
  tipe: string;
  sumber: string;
  tanggal: string;
  total: number;
  pakai_tax: boolean;
  diskon_percent: number;
  status_bayar: string;
  nama_pembeli: string | null;
  clients: { company_brand: string } | null;
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

export default async function SalesInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const canCancel =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_cancel;

  const sp = parseListQuery(await searchParams);

  // Nama client ada di tabel lain, jadi dicari dulu id-nya. Cara ini
  // (bukan !inner join) menjaga invoice walk-in yang client_id-nya
  // null tetap ikut tercari lewat nama_pembeli.
  let clientIds: string[] = [];
  if (sp.q) {
    const { data: cs } = await supabase
      .from("clients")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("company_brand", `%${sp.q}%`)
      .limit(500);
    clientIds = (cs || []).map((c) => c.id as string);
  }

  let query = supabase
    .from("sales_invoices")
    .select(
      "id, no_invoice, tipe, sumber, tanggal, total, pakai_tax, diskon_percent, status_bayar, nama_pembeli, clients(company_brand)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(
        ["no_invoice", "nama_pembeli"],
        sp.q,
        "client_id",
        clientIds
      )
    );
  if (sp.filter("tipe")) query = query.eq("tipe", sp.filter("tipe"));
  if (sp.filter("status"))
    query = query.eq("status_bayar", sp.filter("status"));

  const { data: invoices, count } = await query
    .order("created_at", { ascending: false })
    .range(sp.from, sp.to);

  const list = (invoices || []) as unknown as InvRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <SalesShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Invoices</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} dokumen, proforma &amp;
            invoice, dengan/tanpa tax
          </p>
        </div>
        <Link
          href="/sales-invoices/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Buat Proforma / Invoice
        </Link>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari no. invoice / pembeli..."
          info={info}
          filters={[
            {
              param: "tipe",
              label: "Semua Tipe",
              options: [
                { value: "Proforma", label: "Proforma" },
                { value: "Invoice", label: "Invoice" },
              ],
            },
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
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[880px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No.</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tipe</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Client</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Sumber</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Total</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tax</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Bayar</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center text-muted py-10 text-sm">
                  {sp.q || sp.filter("tipe") || sp.filter("status")
                    ? "Tidak ada dokumen yang cocok dengan pencarian/filter."
                    : "Belum ada dokumen penjualan."}
                </td>
              </tr>
            ) : (
              list.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-line last:border-0 hover:bg-white/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                    {inv.no_invoice}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        inv.tipe === "Invoice"
                          ? "bg-botanical-100 text-botanical-700"
                          : "bg-amber-100 text-amber-500"
                      }`}
                    >
                      {inv.tipe}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[180px] truncate font-medium">
                      {inv.clients?.company_brand || inv.nama_pembeli || "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                    {inv.sumber}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatTanggal(inv.tanggal)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatRupiah(Number(inv.total))}
                    {Number(inv.diskon_percent) > 0 && (
                      <div className="text-[10.5px] text-muted">
                        disc {Number(inv.diskon_percent)}%
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                    {inv.pakai_tax ? "PPN" : "Non-Tax"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        inv.status_bayar === "Lunas"
                          ? "bg-botanical-100 text-botanical-700"
                          : "bg-amber-100 text-amber-500"
                      }`}
                    >
                      {inv.status_bayar}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-3">
                      {canCancel && inv.sumber !== "Konsinyasi" && (
                        <CancelTxButton
                          id={inv.id}
                          action={cancelInvoice}
                          canCancel={canCancel}
                          variant="link"
                          label="Batal"
                          judul="Batalkan Dokumen Penjualan"
                          keterangan="Dokumen dihapus dan stok produk jadi kembali. Tidak bisa bila client sudah membayar."
                        />
                      )}
                      <Link
                        href={`/print/invoice/${inv.id}`}
                        className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        Cetak
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination info={info} />
    </SalesShell>
  );
}
