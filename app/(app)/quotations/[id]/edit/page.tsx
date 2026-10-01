import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getTaxSettings } from "@/lib/taxServer";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { quotationBisaDisunting } from "@/lib/quotation";
import QuotationForm from "../../QuotationForm";
import { getQuotationClients } from "../../data";

type Detail = {
  id: string;
  no_quotation: string;
  client_id: string | null;
  nama_penerima: string | null;
  up: string | null;
  perihal: string | null;
  tanggal: string;
  berlaku_sampai: string | null;
  status: string;
  diskon_percent: number;
  pakai_tax: boolean;
  syarat: string | null;
  invoice_id: string | null;
  quotation_items: {
    urutan: number;
    deskripsi: string;
    keterangan: string | null;
    satuan: string | null;
    qty: number;
    harga: number;
  }[];
};

export default async function EditQuotationPage({
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
      "id, no_quotation, client_id, nama_penerima, up, perihal, tanggal, berlaku_sampai, status, diskon_percent, pakai_tax, syarat, invoice_id, quotation_items(urutan, deskripsi, keterangan, satuan, qty, harga)"
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) notFound();
  const q = data as unknown as Detail;

  const kembali = (
    <Link
      href={`/quotations/${q.id}`}
      className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
    >
      <ArrowLeft size={15} /> Kembali ke {q.no_quotation}
    </Link>
  );

  // Penjaganya juga ada di save_quotation_tx. Yang di sini mencegah
  // orang mengetik ulang seluruh isi lalu baru ditolak di ujung.
  if (!quotationBisaDisunting(q.status, q.invoice_id)) {
    return (
      <div className="max-w-3xl">
        {kembali}
        <div className="glass rounded-2xl p-6 text-[13.5px] text-ink">
          {q.invoice_id
            ? "Quotation ini sudah diterbitkan jadi Proforma, jadi isinya dikunci. Batalkan Proforma-nya dulu di menu Invoices kalau isinya memang harus diubah."
            : `Quotation berstatus ${q.status} tidak bisa disunting. Kembalikan statusnya ke Terkirim dulu di halaman detail.`}
        </div>
      </div>
    );
  }

  const [clients, taxSettings] = await Promise.all([
    getQuotationClients(organizationId!, q.client_id),
    getTaxSettings(organizationId!),
  ]);

  return (
    <div className="max-w-5xl">
      {kembali}
      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Edit Quotation
      </h1>
      <p className="text-muted text-sm mb-6 font-mono">{q.no_quotation}</p>

      <QuotationForm
        clients={clients}
        taxSettings={taxSettings}
        awal={{
          id: q.id,
          no_quotation: q.no_quotation,
          header: {
            client_id: q.client_id,
            nama_penerima: q.nama_penerima,
            up: q.up,
            perihal: q.perihal,
            tanggal: q.tanggal,
            berlaku_sampai: q.berlaku_sampai,
            diskon_percent: Number(q.diskon_percent),
            pakai_tax: q.pakai_tax,
            syarat: q.syarat,
          },
          items: [...q.quotation_items]
            .sort((a, b) => a.urutan - b.urutan)
            .map((it) => ({
              deskripsi: it.deskripsi,
              keterangan: it.keterangan,
              satuan: it.satuan,
              qty: Number(it.qty),
              harga: Number(it.harga),
            })),
        }}
      />
    </div>
  );
}
