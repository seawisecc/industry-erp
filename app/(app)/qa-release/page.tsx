import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProdukShell from "@/components/ProdukShell";
import TableSearch from "@/components/TableSearch";
import { ClipboardList, Printer } from "lucide-react";

type BatchRow = {
  id: string;
  no_batch_produksi: string;
  tanggal_produksi: string;
  qa_status: string;
  qa_note: string | null;
  qa_oleh: string | null;
  qa_tanggal: string | null;
  qc_produk_selesai?: boolean | null;
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

export default async function QaReleasePage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const features = await getFeatures(organizationId!);
  if (!(features.qa)) redirect("/products");

  const [{ data: hold }, { data: history }] = await Promise.all([
    supabase
      .from("production_batches")
      .select(
        `id, no_batch_produksi, tanggal_produksi, qa_status, qa_note, qa_oleh, qa_tanggal,
         qc_produk_selesai,
         production_outputs(qty_hasil, satuan, varian_ukuran, products(kode, nama_produk))`
      )
      .eq("organization_id", organizationId)
      .eq("qa_status", "Hold")
      .order("tanggal_produksi"),
    supabase
      .from("production_batches")
      .select(
        `id, no_batch_produksi, tanggal_produksi, qa_status, qa_note, qa_oleh, qa_tanggal,
         production_outputs(qty_hasil, satuan, varian_ukuran, products(kode, nama_produk))`
      )
      .eq("organization_id", organizationId)
      .in("qa_status", ["Released", "Rejected"])
      .not("qa_tanggal", "is", null)
      .order("qa_tanggal", { ascending: false })
      .limit(15),
  ]);

  const list = (hold || []) as unknown as BatchRow[];
  const logs = (history || []) as unknown as BatchRow[];

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
          QA Release
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          {list.length} batch menunggu review — produk jadi belum masuk stok jual
          sampai batch di-release QA.
        </p>
      </div>

      <div className="mt-4">
        <TableSearch placeholder="Cari no. batch / produk..." />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No. Batch</th>
              <th className="px-4 py-2.5 font-semibold">Produk</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tgl Produksi</th>
              <th className="px-4 py-2.5 font-semibold">Hasil</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Uji QC</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Pelulusan</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10 text-sm">
                  Tidak ada batch menunggu review 🎉 — batch baru dari Production
                  akan muncul di sini.
                </td>
              </tr>
            ) : (
              list.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-line last:border-0 bg-amber-100/20"
                >
                  <td className="px-4 py-3 font-mono text-[12.5px] whitespace-nowrap">
                    {b.no_batch_produksi}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium max-w-[200px] truncate" title={produkOf(b)}>
                      {produkOf(b)}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatTanggal(b.tanggal_produksi)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                    {hasilOf(b)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        b.qc_produk_selesai
                          ? "bg-botanical-100 text-botanical-700"
                          : "bg-amber-100 text-amber-500"
                      }`}
                    >
                      {b.qc_produk_selesai ? "Selesai" : "Menunggu QC"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/qa-release/${b.id}`}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-botanical-700 text-white text-[12px] font-medium hover:bg-botanical-800 transition-colors"
                    >
                      <ClipboardList size={13} /> Tinjau &amp; Luluskan
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Riwayat keputusan QA ===== */}
      <h3 className="font-display text-[15px] font-semibold text-ink mt-6 mb-2">
        Riwayat Keputusan QA
      </h3>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">No. Batch</th>
              <th className="px-4 py-2.5 font-semibold">Produk</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Keputusan</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Oleh</th>
              <th className="px-4 py-2.5 font-semibold">Catatan</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">
                Dokumen
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-8 text-sm">
                  Belum ada riwayat.
                </td>
              </tr>
            ) : (
              logs.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatTanggal(b.qa_tanggal)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                    {b.no_batch_produksi}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[180px] truncate" title={produkOf(b)}>
                      {produkOf(b)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                        b.qa_status === "Released"
                          ? "bg-botanical-100 text-botanical-700"
                          : "bg-clay-100 text-clay-600"
                      }`}
                    >
                      {b.qa_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                    {b.qa_oleh || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[220px] line-clamp-2 text-[12.5px]" title={b.qa_note || undefined}>
                      {b.qa_note || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/print/production/${b.id}`}
                        className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        Batch Record
                      </Link>
                      <Link
                        href={`/print/qa/${b.id}`}
                        className="inline-flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        <Printer size={13} /> CoA
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
