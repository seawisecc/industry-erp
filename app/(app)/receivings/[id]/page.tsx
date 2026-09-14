import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer, Tags } from "lucide-react";
import CancelTxButton from "@/components/CancelTxButton";
import DataTable from "@/components/DataTable";
import PurchaseTotals from "@/components/PurchaseTotals";
import {
  hitungTotalPembelian,
  parsePurchaseTaxMode,
} from "@/lib/purchaseTax";
import RowActions, { IconAction } from "@/components/RowActions";
import { cancelReceiving } from "../actions";

type RcvDetail = {
  id: string;
  no_invoice: string | null;
  tanggal_terima: string;
  supplier_nama: string | null;
  ppn_percent: number;
  tax_mode: string | null;
  tax_dpp_nilai_lain: boolean | null;
  subtotal: number;
  diskon: number | null;
  biaya_kirim: number | null;
  total_ppn: number;
  total_invoice: number;
  top_days: number | null;
  jatuh_tempo: string | null;
  status_bayar: string;
  po_id: string | null;
  purchase_orders: { no_po: string | null } | null;
};

type BatchRow = {
  id: string;
  qty_masuk: number;
  harga_per_unit: number;
  /** Harga di kertas supplier. Beda dengan harga_per_unit pada faktur Include. */
  harga_faktur: number | null;
  no_lot_supplier: string | null;
  exp_date: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
};

/**
 * Harga yang ditampilkan di baris faktur SELALU harga di kertas supplier.
 * Pada faktur Include, harga_per_unit sudah dikeluarkan PPN-nya supaya HPP
 * setara antar supplier, dan angka itu tidak akan cocok dengan kertas yang
 * dipegang orang saat memeriksa dokumen ini.
 */
function hargaFaktur(r: { harga_per_unit: number; harga_faktur: number | null }) {
  return Number(r.harga_faktur ?? r.harga_per_unit);
}

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

export default async function ReceivingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const canCancel =
    isSuperAdmin || profile?.role === "Admin" || !!profile?.can_cancel;

  const { data } = await supabase
    .from("receivings")
    .select(
      "id, no_invoice, tanggal_terima, supplier_nama, ppn_percent, tax_mode, tax_dpp_nilai_lain, subtotal, diskon, biaya_kirim, total_ppn, total_invoice, top_days, jatuh_tempo, status_bayar, po_id, purchase_orders(no_po)"
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const rcv = data as unknown as RcvDetail;

  // Batch milik penerimaan ini (data lama tanpa receiving_id: fallback po+tanggal)
  let { data: batches } = await supabase
    .from("purchase_batches")
    .select("id, qty_masuk, harga_per_unit, harga_faktur, no_lot_supplier, exp_date, items(kode, nama, satuan)")
    .eq("receiving_id", id);

  if (!batches || batches.length === 0) {
    const fallback = await supabase
      .from("purchase_batches")
      .select("id, qty_masuk, harga_per_unit, harga_faktur, no_lot_supplier, exp_date, items(kode, nama, satuan)")
      .eq("po_id", rcv.po_id)
      .eq("tanggal_terima", rcv.tanggal_terima)
      .eq("organization_id", organizationId);
    batches = fallback.data;
  }

  const rows = (batches || []) as unknown as BatchRow[];

  // Rincian dihitung ulang dari angka yang DIBEKUKAN di faktur ini, bukan
  // dari pengaturan pajak yang berlaku sekarang.
  const taxMode = parsePurchaseTaxMode(rcv.tax_mode);
  // Diskon & ongkir dibaca dari dokumennya, bukan dihitung ulang: faktur
  // lama nilainya 0 dan angkanya tidak bergerak sedikit pun.
  const totals = hitungTotalPembelian(
    Number(rcv.subtotal),
    taxMode,
    Number(rcv.ppn_percent),
    rcv.tax_dpp_nilai_lain !== false,
    {
      diskon: Number(rcv.diskon ?? 0),
      biayaKirim: Number(rcv.biaya_kirim ?? 0),
    }
  );

  return (
    <div className="max-w-5xl">
      <Link
        href="/receivings"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Receiving
      </Link>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Penerimaan{" "}
          <span className="font-mono text-[20px]">
            {rcv.no_invoice || rcv.purchase_orders?.no_po || ""}
          </span>
        </h1>
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
            rcv.status_bayar === "Lunas"
              ? "bg-botanical-100 text-botanical-700"
              : "bg-amber-100 text-amber-500"
          }`}
        >
          {rcv.status_bayar}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <CancelTxButton
            id={rcv.id}
            action={cancelReceiving}
            canCancel={canCancel}
            label="Batal Penerimaan"
            judul="Batalkan Penerimaan"
            keterangan="Stok yang masuk dari penerimaan ini akan dihapus dan status PO dikembalikan. Hanya bisa bila barangnya belum terpakai."
            redirectTo="/receivings"
          />
          <Link
            href={`/print/label/receiving/${rcv.id}`}
            className="flex items-center gap-1.5 bg-white/70 border border-line text-ink text-[13px] font-medium px-3.5 py-2 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
          >
            <Tags size={15} /> Cetak Label
          </Link>
          <Link
            href={`/print/receiving/${rcv.id}`}
            className="flex items-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium px-3.5 py-2 rounded-lg hover:bg-botanical-800 transition-colors"
          >
            <Printer size={15} /> Cetak
          </Link>
        </div>
      </div>
      <p className="text-muted text-sm mb-6">
        {formatTanggal(rcv.tanggal_terima)} · {rcv.supplier_nama || "-"}
      </p>

      <div className="glass rounded-2xl p-6 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13.5px]">
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">No. PO</div>
          <div className="font-mono text-[12.5px]">{rcv.purchase_orders?.no_po || "-"}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
            No. Invoice
          </div>
          <div className="font-mono text-[12.5px]">{rcv.no_invoice || "-"}</div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">TOP</div>
          <div>
            {rcv.top_days == null
              ? "-"
              : rcv.top_days === 0
                ? "Tunai / CIA"
                : `${rcv.top_days} hari`}
          </div>
        </div>
        <div>
          <div className="text-[11.5px] text-muted uppercase tracking-wide mb-1">
            Jatuh Tempo
          </div>
          <div>{rcv.jatuh_tempo ? formatTanggal(rcv.jatuh_tempo) : "-"}</div>
        </div>
      </div>

      <DataTable
        rows={rows}
        rowKey={(r, i) => r.id || String(i)}
        minWidth={700}
        empty="Tidak ada item pada faktur ini."
        columns={[
          {
            key: "item",
            header: "Item",
            role: "title",
            cell: (r) => (
              <>
                <span className="font-mono text-[11.5px] text-botanical-700 mr-2">
                  {r.items?.kode}
                </span>
                {r.items?.nama}
              </>
            ),
            cardCell: (r) => (
              <>
                <div>{r.items?.nama}</div>
                <div className="text-[11.5px] text-muted font-mono font-normal">
                  {r.items?.kode}
                </div>
              </>
            ),
          },
          {
            key: "lot",
            header: "Lot Supplier",
            role: "primary",
            className: "font-mono text-[12px] whitespace-nowrap",
            cell: (r) => r.no_lot_supplier || "-",
          },
          {
            key: "exp",
            header: "Exp",
            cardLabel: "Kedaluwarsa",
            role: "secondary",
            className: "whitespace-nowrap text-[12.5px]",
            cell: (r) =>
              r.exp_date
                ? new Date(r.exp_date + "T00:00:00").toLocaleDateString("id-ID", {
                    month: "short",
                    year: "numeric",
                  })
                : "-",
          },
          {
            key: "qty",
            header: "Qty",
            cardLabel: "Qty Masuk",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) =>
              `${Number(r.qty_masuk).toLocaleString("id-ID")} ${r.items?.satuan}`,
          },
          {
            key: "harga",
            header: "Harga/Unit",
            role: "secondary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => formatRupiah(hargaFaktur(r)),
          },
          {
            key: "subtotal",
            header: "Subtotal",
            role: "primary",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) =>
              formatRupiah(Number(r.qty_masuk) * hargaFaktur(r)),
          },
          {
            key: "label",
            header: "Label",
            role: "actions",
            align: "right",
            className: "whitespace-nowrap",
            cell: (r) => (
              <RowActions>
                <IconAction
                  icon={Tags}
                  label="Cetak label lot ini"
                  href={r.id ? `/print/label/lot/${r.id}` : undefined}
                />
              </RowActions>
            ),
          },
        ]}
      />

      <div className="glass rounded-2xl p-6 flex flex-col gap-2 sm:max-w-sm sm:ml-auto text-[13.5px]">
        <PurchaseTotals
          totals={totals}
          mode={taxMode}
          judulTotal="Total Invoice"
        />
      </div>
    </div>
  );
}
