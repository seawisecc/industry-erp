import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { Plus, Wand2, Printer, Pencil, Eye } from "lucide-react";
import PembelianShell from "@/components/PembelianShell";
import TableToolbar from "@/components/TableToolbar";
import Pagination from "@/components/Pagination";
import CancelTxButton from "@/components/CancelTxButton";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import { cancelPO } from "./actions";
import {
  ilikeOrWithIds,
  pageInfo,
  parseListQuery,
  type SearchParams,
} from "@/lib/pagination";

type POStatus =
  | "Dibuat"
  | "Disetujui"
  | "Dikirim"
  | "Diterima Sebagian"
  | "Selesai"
  | "Dibatalkan";

type PORow = {
  id: string;
  no_po: string | null;
  tanggal_po: string;
  status: POStatus;
  ppn_percent: number;
  top_days: number | null;
  suppliers: { nama: string } | null;
  po_items: { qty_pesan: number; harga_per_unit: number }[];
};

const STATUS_STYLE: Record<POStatus, string> = {
  Dibuat: "bg-white/70 text-muted border border-line",
  Disetujui: "bg-amber-100 text-amber-500",
  Dikirim: "bg-clay-100 text-clay-600",
  "Diterima Sebagian": "bg-botanical-100 text-botanical-700",
  Selesai: "bg-botanical-700 text-white",
  Dibatalkan: "bg-clay-100 text-clay-600",
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

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const canCancel =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_cancel;

  const sp = parseListQuery(await searchParams);

  // Nama supplier ada di tabel lain, cari id-nya dulu supaya PO tetap
  // bisa dicari lewat nama supplier, bukan cuma no. PO.
  let supplierIds: string[] = [];
  if (sp.q) {
    const { data: ss } = await supabase
      .from("suppliers")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("nama", `%${sp.q}%`)
      .limit(500);
    supplierIds = (ss || []).map((s) => s.id as string);
  }

  let query = supabase
    .from("purchase_orders")
    .select(
      "id, no_po, tanggal_po, status, ppn_percent, top_days, suppliers(nama), po_items(qty_pesan, harga_per_unit)",
      { count: "exact" }
    )
    .eq("organization_id", organizationId);

  if (sp.q)
    query = query.or(
      ilikeOrWithIds(["no_po"], sp.q, "supplier_id", supplierIds)
    );
  if (sp.filter("status")) query = query.eq("status", sp.filter("status"));

  const { data: pos, count } = await query
    .order("created_at", { ascending: false })
    .range(sp.from, sp.to);

  const list = (pos || []) as unknown as PORow[];
  const info = pageInfo(sp.page, count, list.length);

  /** Nilai PO termasuk PPN, subtotal baris item lalu ditambah pajak. */
  const totalPO = (po: PORow) => {
    const subtotal = po.po_items.reduce(
      (s, r) => s + Number(r.qty_pesan) * Number(r.harga_per_unit),
      0
    );
    return subtotal * (1 + Number(po.ppn_percent) / 100);
  };

  return (
    <PembelianShell>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Purchase Orders
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            {info.total.toLocaleString("id-ID")} PO, alur: Dibuat → Disetujui →
            Dikirim → Diterima
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/purchase-orders/guide"
            className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <Wand2 size={14} /> Guide Order
          </Link>
          <Link
            href="/purchase-orders/new"
            className="inline-flex items-center gap-1.5 h-9 bg-botanical-700 text-white text-[12.5px] font-medium px-3.5 rounded-lg hover:bg-botanical-800 transition-colors shadow-sm whitespace-nowrap"
          >
            <Plus size={15} /> Buat PO
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <TableToolbar
          placeholder="Cari no. PO / supplier..."
          info={info}
          filters={[
            {
              param: "status",
              label: "Semua Status",
              options: [
                "Dibuat",
                "Disetujui",
                "Dikirim",
                "Diterima Sebagian",
                "Selesai",
                "Dibatalkan",
              ].map((s) => ({ value: s, label: s })),
            },
          ]}
        />
      </div>
      <DataTable
        rows={list}
        rowKey={(po) => po.id}
        minWidth={960}
        empty={
          sp.q || sp.filter("status")
            ? "Tidak ada PO yang cocok dengan pencarian/filter."
            : "Belum ada Purchase Order."
        }
        columns={[
          {
            key: "no",
            header: "No. PO",
            role: "subtitle",
            cell: (po) => (
              <span className="font-mono text-[12.5px]">{po.no_po || "-"}</span>
            ),
          },
          {
            key: "tanggal",
            header: "Tanggal",
            role: "primary",
            className: "whitespace-nowrap",
            cell: (po) => formatTanggal(po.tanggal_po),
          },
          {
            key: "supplier",
            header: "Supplier",
            role: "title",
            cell: (po) => (
              <div className="max-w-[220px] truncate font-medium">
                {po.suppliers?.nama || "-"}
              </div>
            ),
            cardCell: (po) => po.suppliers?.nama || "-",
          },
          {
            key: "item",
            header: "Item",
            cardLabel: "Jumlah item",
            role: "secondary",
            cell: (po) => po.po_items.length,
          },
          {
            key: "total",
            header: "Total (incl. PPN)",
            cardLabel: "Total",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (po) => formatRupiah(totalPO(po)),
          },
          {
            key: "top",
            header: "TOP",
            cardLabel: "Termin (TOP)",
            role: "secondary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (po) =>
              po.top_days == null
                ? "-"
                : po.top_days === 0
                  ? "Tunai"
                  : `${po.top_days} hr`,
          },
          {
            key: "status",
            header: "Status",
            role: "badge",
            cell: (po) => (
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium whitespace-nowrap ${STATUS_STYLE[po.status]}`}
              >
                {po.status}
              </span>
            ),
          },
          {
            key: "aksi",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (po) => {
              const editable = po.status === "Dibuat";
              return (
                <RowActions>
                  {canCancel &&
                    po.status !== "Selesai" &&
                    po.status !== "Diterima Sebagian" &&
                    po.status !== "Dibatalkan" && (
                      <CancelTxButton
                        id={po.id}
                        action={cancelPO}
                        canCancel={canCancel}
                        variant="icon"
                        label="Batalkan PO"
                        judul="Batalkan Purchase Order"
                        keterangan="PO akan ditandai Dibatalkan. Hanya bisa bila belum ada barang yang diterima."
                      />
                    )}
                  <IconAction
                    icon={Printer}
                    label="Cetak PO"
                    href={`/print/po/${po.id}`}
                  />
                  <IconAction
                    icon={editable ? Pencil : Eye}
                    label={editable ? "Edit PO" : "Lihat detail PO"}
                    href={`/purchase-orders/${po.id}/edit`}
                    tone="primary"
                  />
                </RowActions>
              );
            },
          },
        ]}
      />
      <Pagination info={info} />
    </PembelianShell>
  );
}
