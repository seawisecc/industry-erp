import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import POForm, { ItemOption } from "../../POForm";
import POStatusActions from "../../POStatusActions";

type POStatus = "Dibuat" | "Disetujui" | "Dikirim" | "Diterima Sebagian" | "Selesai";

type PODetail = {
  id: string;
  no_po: string | null;
  tanggal_po: string;
  supplier_id: string;
  status: POStatus;
  ppn_percent: number;
  top_days: number | null;
  catatan: string | null;
  suppliers: { nama: string } | null;
  po_items: {
    item_id: string;
    qty_pesan: number;
    harga_per_unit: number;
    qty_diterima: number;
    items: { kode: string; nama: string; satuan: string } | null;
  }[];
};

const STATUS_STYLE: Record<POStatus, string> = {
  Dibuat: "bg-white/70 text-muted border border-line",
  Disetujui: "bg-amber-100 text-amber-500",
  Dikirim: "bg-clay-100 text-clay-600",
  "Diterima Sebagian": "bg-botanical-100 text-botanical-700",
  Selesai: "bg-botanical-700 text-white",
};

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function EditPOPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();

  const { data } = await supabase
    .from("purchase_orders")
    .select(
      "id, no_po, tanggal_po, supplier_id, status, ppn_percent, top_days, catatan, suppliers(nama), po_items(item_id, qty_pesan, harga_per_unit, qty_diterima, items(kode, nama, satuan))"
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const po = data as unknown as PODetail;
  const editable = po.status === "Dibuat";
  const canApprove =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_approve_po;

  const statusActions = (
    <POStatusActions
      poId={po.id}
      status={po.status}
      canApprove={canApprove}
      topDays={po.top_days == null ? null : Number(po.top_days)}
    />
  );

  // ============ MODE DETAIL (read-only, PO sudah jalan) ============
  if (!editable) {
    const subtotal = po.po_items.reduce(
      (s, r) => s + Number(r.qty_pesan) * Number(r.harga_per_unit),
      0
    );
    const ppnValue = (subtotal * Number(po.ppn_percent)) / 100;
    return (
      <div className="max-w-3xl">
        <Link
          href="/purchase-orders"
          className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
        >
          <ArrowLeft size={15} /> Kembali ke Purchase Order
        </Link>

        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-display text-2xl font-semibold text-ink">
            <span className="font-mono text-[22px]">{po.no_po}</span>
          </h1>
          <span
            className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${STATUS_STYLE[po.status]}`}
          >
            {po.status}
          </span>
          <Link
            href={`/print/po/${po.id}`}
            className="ml-auto flex items-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium px-3.5 py-2 rounded-lg hover:bg-botanical-800 transition-colors"
          >
            <Printer size={15} /> Cetak PO
          </Link>
        </div>
        <p className="text-muted text-sm mb-6">
          PO dengan status &ldquo;{po.status}&rdquo; tidak bisa diubah atau dihapus.
        </p>

        {statusActions}

        <div className="glass rounded-2xl p-6 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[13.5px]">
          <div>
            <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
              Supplier
            </div>
            <div className="font-medium">{po.suppliers?.nama || "—"}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
              Tanggal PO
            </div>
            <div>{formatTanggal(po.tanggal_po)}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
              Catatan
            </div>
            <div>{po.catatan || "—"}</div>
          </div>
        </div>

        <div className="glass rounded-2xl overflow-x-auto mb-5">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
                <th className="px-4 py-2.5 font-semibold">Item</th>
                <th className="px-4 py-2.5 font-semibold text-right">Qty Pesan</th>
                <th className="px-4 py-2.5 font-semibold text-right">Qty Diterima</th>
                <th className="px-4 py-2.5 font-semibold text-right">Harga/Unit</th>
                <th className="px-4 py-2.5 font-semibold text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {po.po_items.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-mono text-[11.5px] text-botanical-700 mr-2">
                      {r.items?.kode}
                    </span>
                    {r.items?.nama}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {Number(r.qty_pesan).toLocaleString("id-ID")} {r.items?.satuan}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {Number(r.qty_diterima).toLocaleString("id-ID")} {r.items?.satuan}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatRupiah(Number(r.harga_per_unit))}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatRupiah(Number(r.qty_pesan) * Number(r.harga_per_unit))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="glass rounded-2xl p-6 flex flex-col gap-2 sm:max-w-sm sm:ml-auto text-[13.5px]">
          <div className="flex justify-between">
            <span className="text-muted">Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">PPN {Number(po.ppn_percent)}%</span>
            <span>{formatRupiah(ppnValue)}</span>
          </div>
          <div className="flex justify-between font-semibold text-[15px] border-t border-line pt-2 mt-1">
            <span>Total</span>
            <span>{formatRupiah(subtotal + ppnValue)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ============ MODE EDIT (status masih "Dikirim") ============
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, nama")
    .eq("organization_id", organizationId)
    .order("nama");

  const { data: materialLinks } = await supabase
    .from("materials")
    .select("supplier_id, items:item_id(id, kode, nama, satuan, moq)")
    .eq("organization_id", organizationId)
    .not("item_id", "is", null);

  const seen = new Set<string>();
  const itemOptions: ItemOption[] = [];
  for (const link of (materialLinks || []) as unknown as {
    supplier_id: string | null;
    items: { id: string; kode: string; nama: string; satuan: string; moq: number | null } | null;
  }[]) {
    if (!link.items || seen.has(link.items.id)) continue;
    seen.add(link.items.id);
    itemOptions.push({ ...link.items, supplier_id: link.supplier_id });
  }
  itemOptions.sort((a, b) => a.kode.localeCompare(b.kode));

  return (
    <div className="max-w-3xl">
      <Link
        href="/purchase-orders"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Purchase Order
      </Link>

      <div className="flex items-center mb-1">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Edit <span className="font-mono text-[22px]">{po.no_po}</span>
        </h1>
        <Link
          href={`/print/po/${po.id}`}
          className="ml-auto flex items-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium px-3.5 py-2 rounded-lg hover:bg-botanical-800 transition-colors"
        >
          <Printer size={15} /> Cetak PO
        </Link>
      </div>
      <p className="text-muted text-sm mb-6">
        Masih bisa diubah/dihapus karena statusnya &ldquo;Dibuat&rdquo; (belum
        disetujui).
      </p>

      {statusActions}

      <POForm
        suppliers={suppliers || []}
        items={itemOptions}
        po={{
          id: po.id,
          supplier_id: po.supplier_id,
          tanggal_po: po.tanggal_po,
          ppn_percent: Number(po.ppn_percent),
          catatan: po.catatan,
          items: po.po_items.map((r) => ({
            item_id: r.item_id,
            qty_pesan: Number(r.qty_pesan),
            harga_per_unit: Number(r.harga_per_unit),
          })),
        }}
      />
    </div>
  );
}
