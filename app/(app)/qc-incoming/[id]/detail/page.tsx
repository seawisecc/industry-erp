import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

type QcHasil = {
  nama: string;
  satuan: string | null;
  spesifikasi: string | null;
  grup: string | null;
  hasil: string;
};

type BatchRaw = {
  id: string;
  no_lot_supplier: string | null;
  tanggal_terima: string;
  qty_masuk: number;
  supplier_nama: string | null;
  qc_status: string;
  qc_jumlah_sampel: string | null;
  qc_tanggal_sampling: string | null;
  qc_tanggal_uji: string | null;
  qc_note: string | null;
  qc_oleh: string | null;
  qc_tanggal: string | null;
  qc_hasil: QcHasil[] | null;
  items: { kode: string; nama: string; satuan: string; kategori: string } | null;
};

function formatTanggal(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function QcDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const { data } = await supabase
    .from("purchase_batches")
    .select(
      `id, no_lot_supplier, tanggal_terima, qty_masuk, supplier_nama, qc_status,
       qc_jumlah_sampel, qc_tanggal_sampling, qc_tanggal_uji, qc_note, qc_oleh,
       qc_tanggal, qc_hasil, items(kode, nama, satuan, kategori)`
    )
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();

  if (!data) notFound();
  const b = data as unknown as BatchRaw;

  const hasil: QcHasil[] = Array.isArray(b.qc_hasil) ? b.qc_hasil : [];
  const grup = new Map<string, QcHasil[]>();
  for (const h of hasil) {
    const g = h.grup || "Lainnya";
    grup.set(g, [...(grup.get(g) || []), h]);
  }
  const lulus = b.qc_status === "Released";

  const INFO = [
    { label: "Nama Bahan", value: b.items?.nama || "—" },
    { label: "Kode Bahan", value: b.items?.kode || "—", mono: true },
    { label: "No. Batch / Lot", value: b.no_lot_supplier || "—", mono: true },
    { label: "Supplier", value: b.supplier_nama || "—" },
    {
      label: "Jumlah Diterima",
      value: `${Number(b.qty_masuk).toLocaleString("id-ID")} ${b.items?.satuan || ""}`,
    },
    { label: "Jumlah Sampel", value: b.qc_jumlah_sampel || "—" },
    { label: "Tanggal Penerimaan", value: formatTanggal(b.tanggal_terima) },
    { label: "Tanggal Sampling", value: formatTanggal(b.qc_tanggal_sampling) },
    { label: "Tanggal Uji", value: formatTanggal(b.qc_tanggal_uji) },
  ];

  return (
    <div className="max-w-4xl">
      <Link
        href="/qc-incoming"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke QC Incoming
      </Link>

      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h1 className="font-display text-2xl font-semibold text-ink">
          Detail Pengujian
        </h1>
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-medium ${
            lulus
              ? "bg-botanical-100 text-botanical-700"
              : "bg-clay-100 text-clay-600"
          }`}
        >
          {b.qc_status}
        </span>
        <Link
          href={`/print/qc/${b.id}`}
          className="ml-auto inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors"
        >
          <Printer size={14} /> Cetak Lembar Uji
        </Link>
      </div>
      <p className="text-muted text-sm mb-6">
        Diputuskan {formatTanggal(b.qc_tanggal)}
        {b.qc_oleh ? ` oleh ${b.qc_oleh}` : ""}
      </p>

      {/* ===== Informasi ===== */}
      <div className="glass rounded-2xl p-6 mb-4">
        <h3 className="font-display text-[15px] font-semibold text-ink mb-3">
          Informasi Barang &amp; Sampel
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-[13px]">
          {INFO.map((f) => (
            <div key={f.label}>
              <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
                {f.label}
              </div>
              <div className={f.mono ? "font-mono" : "font-medium"}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Hasil uji ===== */}
      <div className="glass rounded-2xl overflow-hidden mb-4">
        <h3 className="font-display text-[15px] font-semibold text-ink px-6 pt-5 pb-3">
          Hasil Pengujian
        </h3>
        {hasil.length === 0 ? (
          <p className="px-6 pb-5 text-muted text-[13px]">
            Tidak ada data pengujian tersimpan untuk batch ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-y border-line bg-white/40">
                  <th className="px-4 py-2 font-semibold">Parameter</th>
                  <th className="px-4 py-2 font-semibold">Spesifikasi</th>
                  <th className="px-4 py-2 font-semibold">Hasil</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(grup.entries()).map(([namaGrup, items]) => (
                  <tr key={namaGrup}>
                    <td colSpan={3} className="p-0">
                      <table className="w-full">
                        <tbody>
                          <tr className="bg-botanical-100/40">
                            <td
                              colSpan={3}
                              className="px-4 py-1.5 text-[11px] uppercase tracking-wide font-semibold text-botanical-700"
                            >
                              {namaGrup}
                            </td>
                          </tr>
                          {items.map((h) => (
                            <tr
                              key={h.nama}
                              className="border-b border-line last:border-0"
                            >
                              <td className="px-4 py-2.5">
                                {h.nama}
                                {h.satuan && (
                                  <span className="text-muted text-[11.5px]">
                                    {" "}
                                    ({h.satuan})
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-muted text-[12.5px]">
                                {h.spesifikasi || "—"}
                              </td>
                              <td className="px-4 py-2.5 font-medium">
                                {h.hasil || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== Kesimpulan ===== */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-[15px] font-semibold text-ink mb-2">
          Kesimpulan QC
        </h3>
        <p className="text-[13px]">
          Batch dinyatakan{" "}
          <b className={lulus ? "text-botanical-700" : "text-clay-600"}>
            {lulus ? "LULUS — masuk stok siap pakai" : "TIDAK LULUS — stok tidak digunakan"}
          </b>
        </p>
        {b.qc_note && (
          <p className="text-muted text-[12.5px] mt-2">Catatan: {b.qc_note}</p>
        )}
      </div>
    </div>
  );
}
