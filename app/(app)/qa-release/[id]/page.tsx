import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { redirect } from "next/navigation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import QaReviewForm, { QaReviewInfo, BahanUji, UjiRow } from "./QaReviewForm";
import type { QaChecklistItem } from "../actions";

type BatchRaw = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  qa_status: string;
  qa_note: string | null;
  qa_checklist: QaChecklistItem[] | null;
  qc_produk_hasil: UjiRow[] | null;
  qc_produk_selesai: boolean | null;
  qc_produk_oleh: string | null;
  qc_produk_tanggal_uji: string | null;
  production_outputs: {
    qty_hasil: number;
    satuan: string;
    varian_ukuran: string | null;
    products: { kode: string | null; nama_produk: string; brand: string | null } | null;
  }[];
  production_components: {
    purchase_batch_id: string | null;
  }[];
};

export default async function QaReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { profile, organizationId, isSuperAdmin } = await getEffectiveOrg();
  const boleh =
    isSuperAdmin || profile?.role === "Admin" || profile?.can_qa === true;
  const features = await getFeatures(organizationId!);
  if (!(features.qa)) redirect("/products");

  const { data } = await supabase
    .from("production_batches")
    .select(
      `id, no_batch_produksi, tanggal_produksi, qa_status, qa_note, qa_checklist,
       qc_produk_hasil, qc_produk_selesai, qc_produk_oleh, qc_produk_tanggal_uji,
       production_outputs(qty_hasil, satuan, varian_ukuran,
         products(kode, nama_produk, brand)),
       production_components(purchase_batch_id)`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const batch = data as unknown as BatchRaw;
  if (batch.qa_status !== "Hold") notFound();

  const produk = batch.production_outputs?.[0]?.products || null;

  // ===== Riwayat uji bahan baku & kemas dari lot yang terpakai =====
  const lotIds = Array.from(
    new Set(
      batch.production_components
        .map((c) => c.purchase_batch_id)
        .filter(Boolean) as string[]
    )
  );
  let bahan: BahanUji[] = [];
  if (lotIds.length > 0) {
    const { data: lots } = await supabase
      .from("purchase_batches")
      .select(
        "id, no_lot_supplier, qc_status, qc_tanggal, qc_oleh, qc_hasil, items(kode, nama, kategori)"
      )
      .eq("organization_id", organizationId)
      .in("id", lotIds);

    bahan = (
      (lots || []) as unknown as {
        id: string;
        no_lot_supplier: string | null;
        qc_status: string;
        qc_tanggal: string | null;
        qc_oleh: string | null;
        qc_hasil: UjiRow[] | null;
        items: { kode: string; nama: string; kategori: string } | null;
      }[]
    )
      .map((l) => ({
        batchId: l.id,
        kode: l.items?.kode || "—",
        nama: l.items?.nama || "—",
        kategori: l.items?.kategori || "—",
        lot: l.no_lot_supplier,
        status: l.qc_status || "Released",
        tanggal: l.qc_tanggal,
        oleh: l.qc_oleh,
        hasil: Array.isArray(l.qc_hasil) ? l.qc_hasil : [],
      }))
      .sort((a, b) => a.kategori.localeCompare(b.kategori) || a.kode.localeCompare(b.kode));
  }

  // ===== Hasil IPC dari plan =====
  const { data: plan } = await supabase
    .from("production_plans")
    .select("execution_data")
    .eq("production_batch_id", batch.id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  const exec = plan?.execution_data as { ipc?: UjiRow[] } | null;
  const ipc = Array.isArray(exec?.ipc) ? exec!.ipc : [];

  const info: QaReviewInfo = {
    batchId: batch.id,
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
    bahan,
    ipc,
    produkJadi: Array.isArray(batch.qc_produk_hasil) ? batch.qc_produk_hasil : [],
    produkJadiSelesai: batch.qc_produk_selesai === true,
    produkJadiOleh: batch.qc_produk_oleh,
    produkJadiTanggal: batch.qc_produk_tanggal_uji,
    checklistTersimpan: Array.isArray(batch.qa_checklist) ? batch.qa_checklist : [],
    note: batch.qa_note,
  };

  return (
    <div className="max-w-4xl">
      <Link
        href="/qa-release"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke QA Release
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Pelulusan Batch
      </h1>
      <p className="text-muted text-sm mb-6">
        {info.produkNama} · batch{" "}
        <span className="font-mono">{info.noBatch}</span> — tinjau seluruh bukti
        pengujian &amp; dokumen, lalu putuskan pelulusan.
      </p>

      <QaReviewForm info={info} boleh={boleh} />
    </div>
  );
}
