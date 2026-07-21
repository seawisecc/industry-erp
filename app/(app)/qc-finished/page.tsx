import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProdukShell from "@/components/ProdukShell";
import TableSearch from "@/components/TableSearch";
import { ClipboardList, Printer, Eye } from "lucide-react";

type BatchRow = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  qa_status: string;
  qc_produk_selesai: boolean | null;
  qc_produk_tanggal_uji: string | null;
  qc_produk_oleh: string | null;
  production_outputs: {
    qty_hasil: number;
    satuan: string;
    varian_ukuran: string | null;
    products: { kode: string | null; nama_produk: string } | null;
  }[];
};

function formatTanggal(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function QcFinishedPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const features = await getFeatures(organizationId!);
  if (!(features.qa && features.qc)) redirect("/products");

  const kolom = `id, no_batch_produksi, tanggal_produksi, qa_status, qc_produk_selesai,
       qc_produk_tanggal_uji, qc_produk_oleh,
       production_outputs(qty_hasil, satuan, varian_ukuran, products(kode, nama_produk))`;

  const [{ data }, { data: riwayat }] = await Promise.all([
    // Antrean: batch masih Hold dan belum selesai diuji
    supabase
      .from("production_batches")
      .select(kolom)
      .eq("organization_id", organizationId)
      .eq("qa_status", "Hold")
      .or("qc_produk_selesai.is.null,qc_produk_selesai.eq.false")
      .order("tanggal_produksi"),
    // Riwayat: semua batch yang sudah pernah diuji QC
    supabase
      .from("production_batches")
      .select(kolom)
      .eq("organization_id", organizationId)
      .eq("qc_produk_selesai", true)
      .order("qc_produk_tanggal_uji", { ascending: false })
      .limit(30),
  ]);

  const list = (data || []) as unknown as BatchRow[];
  const logs = (riwayat || []) as unknown as BatchRow[];
  const belum = list.length;

  const produkOf = (b: BatchRow) =>
    b.production_outputs?.[0]?.products?.nama_produk || "—";
  const hasilOf = (b: BatchRow) =>
    b.production_outputs
      .map(
        (o) =>
          `${o.varian_ukuran ? `${o.varian_ukuran}: ` : ""}${Number(
            o.qty_hasil
          ).toLocaleString("id-ID")} ${o.satuan}`
      )
      .join(" · ");

  return (
    <ProdukShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          QC Produk Jadi
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          {belum} batch menunggu pengujian — hasil uji dikirim ke QA sebagai
          dasar pelulusan batch.
        </p>
      </div>

      <h3 className="font-display text-[15px] font-semibold text-ink mt-5 mb-2">
        Antrean Pengujian
      </h3>
      <div className="mb-3">
        <TableSearch placeholder="Cari no. batch / produk..." />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No. Batch</th>
              <th className="px-4 py-2.5 font-semibold">Produk</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tgl Produksi</th>
              <th className="px-4 py-2.5 font-semibold">Hasil</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">
                Lembar Uji
              </th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted py-10 text-sm">
                  Tidak ada batch menunggu pengujian 🎉
                </td>
              </tr>
            ) : (
              list.map((b) => {
                return (
                  <tr
                    key={b.id}
                    className="border-b border-line last:border-0 bg-amber-100/20"
                  >
                    <td className="px-4 py-3 font-mono text-[12.5px] whitespace-nowrap">
                      {b.no_batch_produksi}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium max-w-[190px] truncate" title={produkOf(b)}>
                        {produkOf(b)}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatTanggal(b.tanggal_produksi)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                      {hasilOf(b)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/qc-finished/${b.id}`}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-botanical-700 text-white text-[12px] font-medium hover:bg-botanical-800 transition-colors"
                      >
                        <ClipboardList size={13} /> Uji Produk
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Riwayat pengujian produk jadi ===== */}
      <h3 className="font-display text-[15px] font-semibold text-ink mt-6 mb-2">
        Riwayat Pengujian
      </h3>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tgl Uji</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No. Batch</th>
              <th className="px-4 py-2.5 font-semibold">Produk</th>
              <th className="px-4 py-2.5 font-semibold">Hasil</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Diuji Oleh</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Status QA</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">
                Dokumen
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-8 text-sm">
                  Belum ada riwayat pengujian.
                </td>
              </tr>
            ) : (
              logs.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatTanggal(b.qc_produk_tanggal_uji)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                    {b.no_batch_produksi}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[190px] truncate" title={produkOf(b)}>
                      {produkOf(b)}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                    {hasilOf(b)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                    {b.qc_produk_oleh || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                        b.qa_status === "Released"
                          ? "bg-botanical-100 text-botanical-700"
                          : b.qa_status === "Rejected"
                            ? "bg-clay-100 text-clay-600"
                            : "bg-amber-100 text-amber-500"
                      }`}
                    >
                      {b.qa_status === "Hold" ? "Menunggu QA" : b.qa_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-3">
                      <Link
                        href={`/qc-finished/${b.id}`}
                        className="inline-flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        <Eye size={13} /> Detail
                      </Link>
                      <Link
                        href={`/print/qc-produk/${b.id}`}
                        className="inline-flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        <Printer size={13} /> Cetak
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ProdukShell>
  );
}
