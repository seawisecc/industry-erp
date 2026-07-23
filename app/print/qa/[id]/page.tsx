import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { notFound } from "next/navigation";
import { getDocSigners } from "@/lib/docSignServer";
import PrintButton from "../../po/[id]/PrintButton";

type QaHasil = {
  nama: string;
  satuan: string | null;
  spesifikasi: string | null;
  grup: string | null;
  hasil: string;
};

type BatchPrint = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  qa_status: string;
  qc_produk_jumlah_sampel: string | null;
  qc_produk_tanggal_uji: string | null;
  qc_produk_oleh: string | null;
  qa_note: string | null;
  qa_oleh: string | null;
  qa_tanggal: string | null;
  qc_produk_hasil: QaHasil[] | null;
  qa_checklist: { label: string; ok: boolean }[] | null;
  production_outputs: {
    qty_hasil: number;
    satuan: string;
    varian_ukuran: string | null;
    products: { kode: string | null; nama_produk: string; brand: string | null } | null;
  }[];
};

function formatTanggal(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function PrintQaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const [{ data }, { data: org }, { data: settings }] = await Promise.all([
    supabase
      .from("production_batches")
      .select(
        `id, no_batch_produksi, tanggal_produksi, qa_status, qc_produk_jumlah_sampel,
         qc_produk_tanggal_uji, qc_produk_oleh, qc_produk_hasil, qa_checklist,
         qa_note, qa_oleh, qa_tanggal,
         production_outputs(qty_hasil, satuan, varian_ukuran,
           products(kode, nama_produk, brand))`
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single(),
    supabase.from("organizations").select("nama").eq("id", organizationId).single(),
    supabase
      .from("organization_settings")
      .select("alamat, no_telp, email")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (!data) notFound();
  const b = data as unknown as BatchPrint;
  const produk = b.production_outputs?.[0]?.products;

  const hasil: QaHasil[] = Array.isArray(b.qc_produk_hasil)
    ? b.qc_produk_hasil
    : [];
  const checklist = Array.isArray(b.qa_checklist) ? b.qa_checklist : [];
  const grup = new Map<string, QaHasil[]>();
  for (const h of hasil) {
    const g = h.grup || "Lainnya";
    grup.set(g, [...(grup.get(g) || []), h]);
  }

  const signers = await getDocSigners(organizationId!, "qa");
  const lulus = b.qa_status === "Released";

  const kontakLine = [
    settings?.no_telp ? `Telp: ${settings.no_telp}` : null,
    settings?.email ? `Email: ${settings.email}` : null,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <div className="min-h-screen py-4 sm:py-8 print:py-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { body { background: white !important; } }
      `}</style>

      <PrintButton />

      <div className="bg-white text-[#1a1a1a] a4-sheet max-w-[210mm] mx-auto shadow-xl print:shadow-none rounded-sm print:rounded-none p-[15mm] print:p-0 text-[12.5px] leading-relaxed">
        {/* ===== KOP ===== */}
        <div className="flex justify-between items-start border-b-2 border-[#1a1a1a] pb-4">
          <div>
            <div className="font-display text-[22px] font-bold leading-tight">
              {org?.nama}
            </div>
            {settings?.alamat && (
              <div className="text-[11.5px] text-neutral-600 mt-1 max-w-[90mm] whitespace-pre-line">
                {settings.alamat}
              </div>
            )}
            {kontakLine && (
              <div className="text-[11px] text-neutral-600 mt-0.5">{kontakLine}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[19px] font-bold tracking-wide">
              SERTIFIKAT ANALISA
            </div>
            <div className="text-[11px] text-neutral-500 tracking-wide">
              CERTIFICATE OF ANALYSIS
            </div>
            <div className="text-[11.5px] text-neutral-600 mt-0.5">
              Tanggal Uji: {formatTanggal(b.qc_produk_tanggal_uji)}
            </div>
          </div>
        </div>

        {/* ===== IDENTITAS PRODUK ===== */}
        <table className="w-full mt-5 text-[12px]">
          <tbody>
            <tr>
              <td className="py-1 pr-3 text-neutral-500 w-[32mm]">Nama Produk</td>
              <td className="py-1 pr-6 font-semibold">
                {produk?.nama_produk || "—"}
              </td>
              <td className="py-1 pr-3 text-neutral-500 w-[32mm]">Kode Produk</td>
              <td className="py-1 font-mono">{produk?.kode || "—"}</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-neutral-500">No. Batch</td>
              <td className="py-1 pr-6 font-mono font-semibold">
                {b.no_batch_produksi}
              </td>
              <td className="py-1 pr-3 text-neutral-500">Brand</td>
              <td className="py-1">{produk?.brand || "—"}</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-neutral-500">Tanggal Produksi</td>
              <td className="py-1 pr-6">{formatTanggal(b.tanggal_produksi)}</td>
              <td className="py-1 pr-3 text-neutral-500">Jumlah Sampel</td>
              <td className="py-1">{b.qc_produk_jumlah_sampel || "—"}</td>
            </tr>
            <tr>
              <td className="py-1 pr-3 text-neutral-500 align-top">Hasil Produksi</td>
              <td className="py-1 pr-6" colSpan={3}>
                {b.production_outputs
                  .map(
                    (o) =>
                      `${o.varian_ukuran ? `${o.varian_ukuran}: ` : ""}${Number(
                        o.qty_hasil
                      ).toLocaleString("id-ID")} ${o.satuan}`
                  )
                  .join("  ·  ")}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ===== HASIL UJI ===== */}
        <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-6 mb-1">
          Hasil Pengujian Produk Jadi
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wide border-y-2 border-[#1a1a1a]">
              <th className="py-2 pr-2 text-left w-[8mm]">No</th>
              <th className="py-2 pr-2 text-left">Parameter</th>
              <th className="py-2 pr-2 text-left">Spesifikasi</th>
              <th className="py-2 text-left">Hasil</th>
            </tr>
          </thead>
          <tbody>
            {hasil.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-neutral-500">
                  Tidak ada data pengujian.
                </td>
              </tr>
            ) : (
              (() => {
                let no = 0;
                return Array.from(grup.entries()).map(([namaGrup, items]) => (
                  <tr key={namaGrup} className="align-top">
                    <td colSpan={4} className="p-0">
                      <table className="w-full border-collapse">
                        <tbody>
                          <tr>
                            <td
                              colSpan={4}
                              className="py-1.5 text-[10.5px] uppercase tracking-wide font-semibold bg-neutral-100"
                            >
                              {namaGrup}
                            </td>
                          </tr>
                          {items.map((h) => {
                            no++;
                            return (
                              <tr key={h.nama} className="border-b border-neutral-300">
                                <td className="py-2 pr-2 w-[8mm]">{no}.</td>
                                <td className="py-2 pr-2">
                                  {h.nama}
                                  {h.satuan && (
                                    <span className="text-neutral-500"> ({h.satuan})</span>
                                  )}
                                </td>
                                <td className="py-2 pr-2 text-neutral-600">
                                  {h.spesifikasi || "—"}
                                </td>
                                <td className="py-2 font-medium">{h.hasil || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ));
              })()
            )}
          </tbody>
        </table>

        {/* ===== VERIFIKASI QA ===== */}
        {checklist.length > 0 && (
          <>
            <div className="text-[11px] uppercase tracking-wide text-neutral-500 mt-6 mb-1">
              Verifikasi Pelulusan (QA)
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11.5px]">
              {checklist.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="font-bold">{c.ok ? "\u2713" : "\u2717"}</span>
                  <span className={c.ok ? "" : "text-neutral-500"}>{c.label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== KESIMPULAN ===== */}
        <div className="mt-5 flex items-start gap-4">
          <div className="text-[11px] uppercase tracking-wide text-neutral-500 pt-1 w-[32mm]">
            Kesimpulan
          </div>
          <div>
            <span
              className={`inline-block px-3 py-1 text-[13px] font-bold border-2 ${
                lulus
                  ? "border-[#2F4D3A] text-[#2F4D3A]"
                  : "border-[#A8502F] text-[#A8502F]"
              }`}
            >
              {lulus ? "DILULUSKAN (RELEASED)" : "DITOLAK (REJECTED)"}
            </span>
            {b.qa_note && (
              <div className="text-[11.5px] text-neutral-700 mt-2 max-w-[120mm]">
                Catatan: {b.qa_note}
              </div>
            )}
            {b.qa_tanggal && (
              <div className="text-[11px] text-neutral-500 mt-1">
                Diputuskan {formatTanggal(b.qa_tanggal)}
                {b.qa_oleh ? ` oleh ${b.qa_oleh}` : ""}
              </div>
            )}
          </div>
        </div>

        {/* ===== TANDA TANGAN ===== */}
        {signers.length > 0 && (
          <div
            className="mt-10 grid gap-6 text-center break-inside-avoid"
            style={{ gridTemplateColumns: `repeat(${signers.length}, 1fr)` }}
          >
            {signers.map((s, i) => (
              <div key={i}>
                <div className="text-[12px]">{s.label}</div>
                <div className="h-[22mm]" />
                <div className="font-semibold border-b border-[#1a1a1a] inline-block min-w-[40mm] pb-0.5">
                  {s.nama || b.qa_oleh || "(............................)"}
                </div>
                <div className="text-[11px] text-neutral-600 mt-1">
                  {s.jabatan || ""}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-10 pt-3 border-t border-neutral-300 text-[10px] text-neutral-400 flex justify-between">
          <span>Certificate of Analysis — batch {b.no_batch_produksi}</span>
          <span>{org?.nama}</span>
        </div>
      </div>
    </div>
  );
}
