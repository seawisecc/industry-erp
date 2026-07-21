import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { redirect } from "next/navigation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import QcSheetForm, { SheetInfo } from "./QcSheetForm";
import type { QcHasilRow } from "../actions";

type BatchRaw = {
  id: string;
  no_lot_supplier: string | null;
  tanggal_terima: string;
  exp_date: string | null;
  qty_karantina: number;
  qty_masuk: number;
  supplier_nama: string | null;
  qc_status: string;
  qc_jumlah_sampel: string | null;
  qc_tanggal_sampling: string | null;
  qc_tanggal_uji: string | null;
  qc_note: string | null;
  qc_hasil: QcHasilRow[] | null;
  items: {
    id: string;
    kode: string;
    nama: string;
    satuan: string;
    kategori: string;
    qc_spec: Record<string, string> | null;
  } | null;
};

export default async function QcSheetPage({
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
  if (!(features.qc)) redirect("/items");

  const { data } = await supabase
    .from("purchase_batches")
    .select(
      `id, no_lot_supplier, tanggal_terima, exp_date, qty_karantina, qty_masuk,
       supplier_nama, qc_status, qc_jumlah_sampel, qc_tanggal_sampling,
       qc_tanggal_uji, qc_note, qc_hasil, items(id, kode, nama, satuan, kategori, qc_spec)`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const batch = data as unknown as BatchRaw;
  if (batch.qc_status !== "Karantina") notFound();

  // Parameter mengikuti kategori item: Kemasan → bahan_kemas, selain itu bahan_baku
  const kategoriParam =
    batch.items?.kategori === "Kemasan" ? "bahan_kemas" : "bahan_baku";
  const { data: paramRows } = await supabase
    .from("qc_parameters")
    .select("nama, satuan, spesifikasi, grup, urutan")
    .eq("organization_id", organizationId)
    .eq("kategori", kategoriParam)
    .eq("aktif", true)
    .order("urutan");

  const itemSpec = (batch.items?.qc_spec || {}) as Record<string, string>;

  const parameters: QcHasilRow[] = (
    (paramRows || []) as {
      nama: string;
      satuan: string | null;
      spesifikasi: string | null;
      grup: string | null;
    }[]
  ).map((p) => ({
    nama: p.nama,
    satuan: p.satuan,
    // Spesifikasi bahan ini (dari pengujian sebelumnya) — fallback ke
    // default parameter bila bahan belum pernah diuji.
    spesifikasi: itemSpec[p.nama] ?? p.spesifikasi,
    grup: p.grup,
    hasil: "",
  }));

  const info: SheetInfo = {
    batchId: batch.id,
    itemKode: batch.items?.kode || "—",
    itemNama: batch.items?.nama || "—",
    satuan: batch.items?.satuan || "",
    qty: Number(batch.qty_karantina || batch.qty_masuk),
    noLot: batch.no_lot_supplier,
    supplier: batch.supplier_nama,
    tanggalTerima: batch.tanggal_terima,
    expDate: batch.exp_date,
    jumlahSampel: batch.qc_jumlah_sampel,
    tanggalSampling: batch.qc_tanggal_sampling,
    tanggalUji: batch.qc_tanggal_uji,
    note: batch.qc_note,
    hasilTersimpan: Array.isArray(batch.qc_hasil) ? batch.qc_hasil : [],
  };

  return (
    <div className="max-w-4xl">
      <Link
        href="/qc-incoming"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke QC Incoming
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Lembar Pengujian
      </h1>
      <p className="text-muted text-sm mb-6">
        {info.itemNama} · lot {info.noLot || "—"} · parameter{" "}
        {kategoriParam === "bahan_kemas" ? "Bahan Kemas" : "Bahan Baku"} — isi hasil
        uji tiap parameter, lalu putuskan Release atau Reject.
      </p>

      <QcSheetForm info={info} parameters={parameters} boleh={boleh} />
    </div>
  );
}
