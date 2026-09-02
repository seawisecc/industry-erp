import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer, FileText } from "lucide-react";
import ReportSaleForm, { ConsItem } from "./ReportSaleForm";
import { clientPriceKey } from "@/lib/clientPrice";
import { getTaxSettings } from "@/lib/taxServer";
import DataTable from "@/components/DataTable";
import RowActions, { IconAction } from "@/components/RowActions";
import CancelTxButton from "@/components/CancelTxButton";
import { cancelInvoice } from "../../sales-invoices/actions";

type ConsDetail = {
  id: string;
  no_konsinyasi: string | null;
  tanggal_kirim: string;
  status: string;
  catatan: string | null;
  client_id: string;
  clients: { company_brand: string; cp: string | null } | null;
  consignment_items: {
    id: string;
    product_id: string;
    varian_ukuran: string | null;
    qty_kirim: number;
    qty_terjual: number;
    qty_retur: number;
    harga_jual: number;
    products: { nama_produk: string; brand: string | null } | null;
  }[];
};

type InvoiceRingkas = {
  id: string;
  no_invoice: string | null;
  tipe: string;
  tanggal: string;
  total: number;
  status_bayar: string;
};

function formatTanggal(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default async function ConsignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId, profile, isSuperAdmin } = await getEffectiveOrg();
  const canCancel =
    !!isSuperAdmin || profile?.role === "Admin" || !!profile?.can_cancel;

  const { data } = await supabase
    .from("consignments")
    .select(
      `id, no_konsinyasi, tanggal_kirim, status, catatan, client_id,
       clients(company_brand, cp),
       consignment_items(id, product_id, varian_ukuran, qty_kirim, qty_terjual, qty_retur, harga_jual, products(nama_produk, brand))`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const cons = data as unknown as ConsDetail;

  // Diskon khusus outlet ini. Diambil SEKARANG, bukan dibekukan saat
  // pengiriman: kesepakatan diskon berlaku pada saat barang laku, dan
  // itu yang ditagihkan.
  const { data: diskonRows } = await supabase
    .from("client_prices")
    .select("product_id, varian, diskon_persen")
    .eq("organization_id", organizationId)
    .eq("client_id", cons.client_id)
    .not("diskon_persen", "is", null);

  const diskonMap = new Map<string, number>();
  for (const d of (diskonRows || []) as {
    product_id: string;
    varian: string | null;
    diskon_persen: number | null;
  }[]) {
    if (d.diskon_persen == null) continue;
    diskonMap.set(
      clientPriceKey(cons.client_id, d.product_id, d.varian),
      Number(d.diskon_persen)
    );
  }

  const taxSettings = await getTaxSettings(organizationId!);

  // ===== Invoice yang lahir dari pengiriman ini =====
  //
  // Dicari lewat consignment_sale_lines, BUKAN lewat
  // sales_invoices.consignment_id. Kolom itu cuma terisi pada laku
  // per-pengiriman; laku yang dicatat per outlet menyebar FIFO ke
  // beberapa pengiriman sekaligus dan header-nya tidak menyimpan
  // pengiriman mana pun. Catatan asal stoklah yang tahu.
  const { data: alokasi } = await supabase
    .from("consignment_sale_lines")
    .select("invoice_id, qty, consignment_items!inner(consignment_id)")
    .eq("organization_id", organizationId)
    .eq("consignment_items.consignment_id", id);

  const qtyPerInvoice = new Map<string, number>();
  for (const a of (alokasi || []) as unknown as {
    invoice_id: string;
    qty: number;
  }[]) {
    qtyPerInvoice.set(
      a.invoice_id,
      (qtyPerInvoice.get(a.invoice_id) || 0) + Number(a.qty)
    );
  }

  const { data: invRows } = qtyPerInvoice.size
    ? await supabase
        .from("sales_invoices")
        .select("id, no_invoice, tipe, tanggal, total, status_bayar")
        .eq("organization_id", organizationId)
        .in("id", Array.from(qtyPerInvoice.keys()))
        .order("tanggal", { ascending: false })
    : { data: [] };

  const invoices = ((invRows || []) as InvoiceRingkas[]).map((v) => ({
    ...v,
    qtyDariSini: qtyPerInvoice.get(v.id) || 0,
  }));


  const items: ConsItem[] = cons.consignment_items.map((it) => ({
    id: it.id,
    nama: it.products?.nama_produk || "-",
    brand: it.products?.brand || null,
    varian: it.varian_ukuran,
    qty_kirim: Number(it.qty_kirim),
    qty_terjual: Number(it.qty_terjual),
    qty_retur: Number(it.qty_retur),
    harga_jual: Number(it.harga_jual),
    diskon_persen:
      diskonMap.get(clientPriceKey(cons.client_id, it.product_id, it.varian_ukuran)) ??
      0,
  }));

  return (
    <div className="max-w-6xl">
      <Link
        href="/consignments"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Consignment
      </Link>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">
          <span className="font-mono text-[20px]">{cons.no_konsinyasi}</span>
        </h1>
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
            cons.status === "Aktif"
              ? "bg-amber-100 text-amber-500"
              : "bg-botanical-100 text-botanical-700"
          }`}
        >
          {cons.status}
        </span>
        <Link
          href={`/print/konsinyasi/${cons.id}`}
          className="ml-auto flex items-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium px-3.5 py-2 rounded-lg hover:bg-botanical-800 transition-colors whitespace-nowrap"
        >
          <Printer size={15} /> Cetak Tanda Terima
        </Link>
      </div>
      <p className="text-muted text-sm mb-6">
        {cons.clients?.company_brand}
        {cons.clients?.cp ? ` · UP ${cons.clients.cp}` : ""}
        {cons.catatan ? `, ${cons.catatan}` : ""}
      </p>

      <ReportSaleForm
        consignmentId={cons.id}
        items={items}
        aktif={cons.status === "Aktif"}
        taxSettings={taxSettings}
      />

      {/* ===== Invoice dari pengiriman ini =====
          Ditaruh di sini, bukan cuma di daftar Sales Invoices, karena
          orang yang mau mengoreksi laku biasanya sedang membuka layar
          outletnya, bukan daftar faktur. */}
      {invoices.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="rounded-lg p-1.5 bg-botanical-100 text-botanical-700">
              <FileText size={16} />
            </div>
            <div>
              <h2 className="font-display text-[15px] font-semibold text-ink">
                Invoice dari Pengiriman Ini
              </h2>
              <p className="text-muted text-[11.5px]">
                Membatalkan invoice mengembalikan qty-nya ke pengiriman ini
                {cons.status === "Aktif"
                  ? ", jadi sisa di outlet bertambah lagi."
                  : ". Karena pengirimannya sudah ditutup, qty itu dicatat sebagai retur dan stok produk jadi bertambah."}
              </p>
            </div>
          </div>

          <DataTable
            rows={invoices}
            rowKey={(v) => v.id}
            minWidth={640}
            empty="Belum ada invoice dari pengiriman ini."
            columns={[
              {
                key: "no",
                header: "No. Invoice",
                role: "title",
                cell: (v) => (
                  <span className="font-mono text-[12.5px]">{v.no_invoice}</span>
                ),
              },
              {
                key: "tipe",
                header: "Tipe",
                role: "secondary",
                cell: (v) => v.tipe,
              },
              {
                key: "tanggal",
                header: "Tanggal",
                role: "primary",
                className: "whitespace-nowrap",
                cell: (v) => formatTanggal(v.tanggal),
              },
              {
                key: "qty",
                header: "Qty dari Sini",
                role: "primary",
                align: "right",
                className: "whitespace-nowrap",
                cell: (v) => `${v.qtyDariSini.toLocaleString("id-ID")} pcs`,
              },
              {
                key: "total",
                header: "Total",
                role: "primary",
                align: "right",
                className: "whitespace-nowrap font-medium",
                cell: (v) => formatRupiah(Number(v.total)),
              },
              {
                key: "bayar",
                header: "Bayar",
                role: "badge",
                cell: (v) => v.status_bayar,
                cardCell: (v) => (
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                      v.status_bayar === "Lunas"
                        ? "bg-botanical-100 text-botanical-700"
                        : "bg-amber-100 text-amber-500"
                    }`}
                  >
                    {v.status_bayar}
                  </span>
                ),
              },
              {
                key: "aksi",
                header: "Aksi",
                role: "actions",
                align: "right",
                cell: (v) => (
                  <RowActions>
                    {canCancel && (
                      <CancelTxButton
                        id={v.id}
                        action={cancelInvoice}
                        canCancel={canCancel}
                        variant="icon"
                        label="Batalkan invoice"
                        judul="Batalkan Invoice Konsinyasi"
                        keterangan={`Dokumen dihapus dan ${v.qtyDariSini.toLocaleString("id-ID")} pcs kembali ke pengiriman ini. Tidak bisa bila client sudah membayar.`}
                      />
                    )}
                    <IconAction
                      icon={Printer}
                      label="Cetak faktur"
                      href={`/print/invoice/${v.id}`}
                      tone="primary"
                    />
                  </RowActions>
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
