import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import DataTable from "@/components/DataTable";
import { hitungTotalDokumen, parseTaxMode } from "@/lib/invoiceMath";
import { localDateStr, localDateTimeStr } from "@/lib/dates";
import {
  kedaluwarsa,
  klasStatusQuotation,
  quotationBisaDisunting,
} from "@/lib/quotation";
import QuotationActions from "./QuotationActions";

type Detail = {
  id: string;
  no_quotation: string;
  nama_penerima: string | null;
  up: string | null;
  perihal: string | null;
  tanggal: string;
  berlaku_sampai: string | null;
  status: string;
  diskon_percent: number;
  pakai_tax: boolean;
  tax_mode: string;
  tax_percent: number;
  tax_dpp_nilai_lain: boolean;
  subtotal: number;
  total: number;
  syarat: string | null;
  invoice_id: string | null;
  created_at: string;
  clients: { company_brand: string } | null;
  sales_invoices: {
    no_invoice: string | null;
    tipe: string;
    status_bayar: string;
  } | null;
  quotation_items: {
    id: string;
    urutan: number;
    deskripsi: string;
    keterangan: string | null;
    satuan: string | null;
    qty: number;
    harga: number;
    subtotal: number;
  }[];
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

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data } = await supabase
    .from("quotations")
    .select(
      `id, no_quotation, nama_penerima, up, perihal, tanggal, berlaku_sampai, status,
       diskon_percent, pakai_tax, tax_mode, tax_percent, tax_dpp_nilai_lain, subtotal, total,
       syarat, invoice_id, created_at,
       clients(company_brand),
       sales_invoices(no_invoice, tipe, status_bayar),
       quotation_items(id, urutan, deskripsi, keterangan, satuan, qty, harga, subtotal)`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) notFound();
  const q = data as unknown as Detail;

  const items = [...q.quotation_items].sort((a, b) => a.urutan - b.urutan);
  const kepada = q.clients?.company_brand || q.nama_penerima || "-";
  const lewat = kedaluwarsa(q.status, q.berlaku_sampai, localDateStr());
  const bisaEdit = quotationBisaDisunting(q.status, q.invoice_id);

  // Rinciannya dihitung ulang dengan aturan pajak yang dibekukan di
  // dokumen ini, bukan pengaturan yang berlaku sekarang.
  const taxMode = parseTaxMode(q.tax_mode);
  const rincian = hitungTotalDokumen(
    Number(q.subtotal),
    Number(q.diskon_percent),
    q.pakai_tax,
    Number(q.tax_percent),
    taxMode,
    q.tax_dpp_nilai_lain
  );

  return (
    <div className="max-w-5xl">
      <Link
        href="/quotations"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Quotations
      </Link>

      {/* ===== KEPALA ===== */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-[13px] text-botanical-700">
                {q.no_quotation}
              </span>
              <span
                className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${klasStatusQuotation(
                  q.status,
                  lewat
                )}`}
              >
                {lewat ? "Kedaluwarsa" : q.status}
              </span>
            </div>
            <h1 className="font-display text-2xl font-semibold text-ink mt-1.5">
              {kepada}
            </h1>
            <p className="text-muted text-[13px] mt-0.5">
              {[q.perihal, q.up ? `UP ${q.up}` : null, formatTanggal(q.tanggal)]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {lewat && (
              <p className="text-clay-600 text-[12.5px] mt-1.5">
                Masa berlakunya sudah lewat ({formatTanggal(q.berlaku_sampai!)}).
                Perpanjang lewat Edit kalau penawarannya masih berlaku.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Link
              href={`/print/quotation/${q.id}`}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-line text-ink text-[12.5px] font-medium hover:bg-white/60 transition-colors"
            >
              <Printer size={15} /> Cetak
            </Link>
            {bisaEdit && (
              <Link
                href={`/quotations/${q.id}/edit`}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-line text-ink text-[12.5px] font-medium hover:bg-white/60 transition-colors"
              >
                <Pencil size={15} /> Edit
              </Link>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Tanggal", nilai: formatTanggal(q.tanggal) },
            {
              label: "Berlaku Sampai",
              nilai: q.berlaku_sampai ? formatTanggal(q.berlaku_sampai) : "-",
            },
            { label: "Total", nilai: formatRupiah(Number(q.total)) },
            { label: "Dibuat", nilai: localDateTimeStr(q.created_at) },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-white/50 px-3.5 py-2.5">
              <div className="text-[11.5px] text-muted">{k.label}</div>
              <div className="text-[13.5px] font-medium text-ink mt-0.5">{k.nilai}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-line/70 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          {q.invoice_id && q.sales_invoices ? (
            <div className="text-[13px]">
              <span className="text-muted">Sudah diterbitkan jadi </span>
              <Link
                href={`/print/invoice/${q.invoice_id}`}
                className="font-mono font-medium text-botanical-700 hover:underline"
              >
                {q.sales_invoices.no_invoice}
              </Link>
              <span className="text-muted">
                {" "}
                ({q.sales_invoices.tipe} · {q.sales_invoices.status_bayar}). Isi
                quotation dikunci; batalkan Proforma-nya di menu Invoices kalau
                harus diubah.
              </span>
            </div>
          ) : (
            <p className="text-[12.5px] text-muted max-w-md">
              Quotation tidak memotong stok dan belum jadi tagihan. Piutang baru
              tercatat waktu Proforma diterbitkan.
            </p>
          )}
          <QuotationActions
            id={q.id}
            noQuotation={q.no_quotation}
            kepada={kepada}
            status={q.status}
            total={Number(q.total)}
            sudahProforma={!!q.invoice_id}
          />
        </div>
      </div>

      {/* ===== BARIS ===== */}
      <div className="mt-5">
        <DataTable
          rows={items}
          rowKey={(it) => it.id}
          minWidth={640}
          maxHeight={false}
          columns={[
            {
              key: "deskripsi",
              header: "Deskripsi",
              role: "title",
              cell: (it) => (
                <div>
                  <div className="font-medium">{it.deskripsi}</div>
                  {it.keterangan && (
                    <div className="text-[12px] text-muted whitespace-pre-line mt-0.5">
                      {it.keterangan}
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: "qty",
              header: "Qty",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (it) =>
                `${Number(it.qty).toLocaleString("id-ID")}${it.satuan ? ` ${it.satuan}` : ""}`,
            },
            {
              key: "harga",
              header: "Harga Satuan",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (it) => formatRupiah(Number(it.harga)),
            },
            {
              key: "subtotal",
              header: "Subtotal",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap font-medium",
              cell: (it) => formatRupiah(Number(it.subtotal)),
            },
          ]}
        />
      </div>

      <div className="mt-5 flex flex-col sm:flex-row gap-5 items-start">
        <div className="glass rounded-2xl p-5 w-full sm:flex-1">
          <h2 className="font-display text-[14.5px] font-semibold text-ink">
            Syarat &amp; Ketentuan
          </h2>
          <p className="text-[13px] text-ink/80 whitespace-pre-line mt-2">
            {q.syarat || <span className="text-muted">Tidak diisi.</span>}
          </p>
        </div>

        <div className="glass rounded-2xl p-5 w-full sm:max-w-sm flex flex-col gap-2 text-[13.5px]">
          <div className="flex justify-between">
            <span className="text-muted">Sub-Total</span>
            <span>{formatRupiah(rincian.subtotal)}</span>
          </div>
          {rincian.diskon !== 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-muted">
                  Discount{" "}
                  {Number(q.diskon_percent).toLocaleString("id-ID", {
                    maximumFractionDigits: 2,
                  })}
                  %
                </span>
                <span className="text-clay-600">− {formatRupiah(rincian.diskon)}</span>
              </div>
              <div className="flex justify-between border-t border-line/70 pt-2">
                <span className="text-muted">Sub Total</span>
                <span>{formatRupiah(rincian.netto)}</span>
              </div>
            </>
          )}
          {q.pakai_tax && (
            <div className="flex flex-col gap-2 rounded-lg bg-white/45 px-3 py-2.5">
              {taxMode === "Include" && (
                <div className="flex justify-between">
                  <span className="text-muted">Sub Total Exc Tax</span>
                  <span>{formatRupiah(rincian.exTax)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted">DPP</span>
                <span>{formatRupiah(rincian.dpp)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">PPN</span>
                <span>{formatRupiah(rincian.tax)}</span>
              </div>
            </div>
          )}
          <div className="flex justify-between font-semibold text-[15px] border-t border-line pt-2 mt-1">
            <span>TOTAL</span>
            <span>{formatRupiah(Number(q.total))}</span>
          </div>
          {q.pakai_tax && (
            <p className="text-[11.5px] text-muted">
              {taxMode === "Include"
                ? "Harga sudah termasuk PPN."
                : "PPN ditambahkan di atas nilai setelah diskon."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
