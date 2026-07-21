import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { redirect } from "next/navigation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import QcProdukForm, { QcProdukInfo } from "./QcProdukForm";
import type { QcProdukHasil } from "../actions";

type BatchRaw = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  qa_status: string;
  qc_produk_jumlah_sampel: string | null;
  qc_produk_tanggal_uji: string | null;
  qc_produk_note: string | null;
  qc_produk_selesai: boolean | null;
  qc_produk_hasil: QcProdukHasil[] | null;
  production_outputs: {
    qty_hasil: number;
    satuan: string;
    varian_ukuran: string | null;
    products: {
      id: string;
      kode: string | null;
      nama_produk: string;
      brand: string | null;
      qa_spec: Record<string, string> | null;
    } | null;
  }[];
};

export default async function QaSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const boleh =
    isSuperAdmin || profile?.role === "Admin" || profile?.can_qc === true;
  const features = await getFeatures(organizationId!);
  if (!(features.qa && features.qc)) redirect("/products");

  const { data } = await supabase
    .from("production_batches")
    .select(
      `id, no_batch_produksi, tanggal_produksi, qa_status, qc_produk_jumlah_sampel,
       qc_produk_tanggal_uji, qc_produk_note, qc_produk_selesai, qc_produk_hasil,
       production_outputs(qty_hasil, satuan, varian_ukuran,
         products(id, kode, nama_produk, brand, qa_spec))`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const batch = data as unknown as BatchRaw;
  if (batch.qa_status !== "Hold") notFound();

  const produk = batch.production_outputs?.[0]?.products || null;

  const { data: paramRows } = await supabase
    .from("qc_parameters")
    .select("nama, satuan, spesifikasi, grup, urutan")
    .eq("organization_id", organizationId)
    .eq("kategori", "produk_jadi")
    .eq("aktif", true)
    .order("urutan");

  const spec = (produk?.qa_spec || {}) as Record<string, string>;
  const parameters: QcProdukHasil[] = (
    (paramRows || []) as {
      nama: string;
      satuan: string | null;
      spesifikasi: string | null;
      grup: string | null;
    }[]
  ).map((p) => ({
    nama: p.nama,
    satuan: p.satuan,
    // Spesifikasi produk ini (dari batch sebelumnya) — fallback ke default
    spesifikasi: spec[p.nama] ?? p.spesifikasi,
    grup: p.grup,
    hasil: "",
  }));

  const info: QcProdukInfo = {
    batchId: batch.id,
    productId: produk?.id || null,
    noBatch: batch.no_batch_produksi,
    produkNama: produk?.nama_produk || "—",
    produkKode: produk?.kode || null,
    brand: produk?.brand || null,
    tanggalProduksi: batch.tanggal_produksi,
    outputs: batch.production_outputs.map((o) => ({
      varian: o.varian_ukuran,
      qty: Number(o.qty_hasil),
      satuan: o.satuan,
    })),
    jumlahSampel: batch.qc_produk_jumlah_sampel,
    tanggalUji: batch.qc_produk_tanggal_uji,
    note: batch.qc_produk_note,
    selesai: batch.qc_produk_selesai === true,
    hasilTersimpan: Array.isArray(batch.qc_produk_hasil)
      ? batch.qc_produk_hasil
      : [],
  };

  return (
    <div className="max-w-4xl">
      <Link
        href="/qc-finished"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke QC Produk Jadi
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Lembar Uji Produk Jadi
      </h1>
      <p className="text-muted text-sm mb-6">
        {info.produkNama} · batch{" "}
        <span className="font-mono">{info.noBatch}</span> — isi hasil uji produk
        jadi, lalu kirim ke QA untuk pelulusan.
      </p>

      <QcProdukForm info={info} parameters={parameters} boleh={boleh} />
    </div>
  );
}
