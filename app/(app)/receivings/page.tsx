import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus } from "lucide-react";
import PembelianShell from "@/components/PembelianShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";

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

export default async function ReceivingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const sp = parseListQuery(await searchParams);

  // No. PO ada di tabel purchase_orders, jadi dicari id-nya dulu.
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
      "id, tanggal_terima, no_invoice, supplier_nama, total_invoice, purchase_orders(no_po)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(["no_invoice", "supplier_nama"], sp.q, "po_id", poIds)
    );

  const { data: receivings, count } = await query
    .order("created_at", { ascending: false })
    .range(sp.from, sp.to);

  const list = (receivings || []) as unknown as ReceivingRow[];
  const info = pageInfo(sp.page, count, list.length);

  return (
    <PembelianShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Receiving</h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} penerimaan, stok bertambah
            lewat halaman ini
          </p>
        </div>
        <Link
          href="/receivings/new"
          className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
        >
          <Plus size={15} /> Terima Barang
        </Link>
      </div>

      <div className="mt-4">

        <TableToolbar placeholder="Cari no. PO / supplier..." info={info} />

      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No. PO</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No. Invoice</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Supplier</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Total Invoice</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10 text-sm">
                  {sp.q
                    ? "Tidak ada penerimaan yang cocok dengan pencarian."
                    : "Belum ada penerimaan barang."}
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
                    {r.purchase_orders?.no_po || "-"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12.5px]">
                    {r.no_invoice || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[220px] truncate font-medium">
                      {r.supplier_nama || "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatRupiah(Number(r.total_invoice))}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/print/receiving/${r.id}`}
                      className="text-muted text-[12.5px] font-medium hover:underline mr-3"
                    >
                      Cetak
                    </Link>
                    <Link
                      href={`/receivings/${r.id}`}
                      className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                    >
                      Detail
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pagination info={info} />
    </PembelianShell>
  );
}
