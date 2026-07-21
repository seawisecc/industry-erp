import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import { getFeatures } from "@/lib/featuresServer";
import { redirect } from "next/navigation";
import BahanShell from "@/components/BahanShell";
import TableSearch from "@/components/TableSearch";
import Link from "next/link";
import { ClipboardList, Printer } from "lucide-react";

type BatchRow = {
  id: string;
  no_lot_supplier: string | null;
  tanggal_terima: string;
  exp_date: string | null;
  qty_karantina: number;
  supplier_nama: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
};

type HistoryRow = {
  id: string;
  qc_status: string;
  qc_note: string | null;
  qc_oleh: string | null;
  qc_tanggal: string | null;
  qty_masuk: number;
  no_lot_supplier: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
};

function formatTanggal(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function QcIncomingPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();
  const features = await getFeatures(organizationId!);
  if (!(features.qc)) redirect("/items");

  const [{ data: karantina }, { data: history }] = await Promise.all([
    supabase
      .from("purchase_batches")
      .select(
        "id, no_lot_supplier, tanggal_terima, exp_date, qty_karantina, supplier_nama, items(kode, nama, satuan)"
      )
      .eq("organization_id", organizationId)
      .eq("qc_status", "Karantina")
      .order("tanggal_terima"),
    supabase
      .from("purchase_batches")
      .select(
        "id, qc_status, qc_note, qc_oleh, qc_tanggal, qty_masuk, no_lot_supplier, items(kode, nama, satuan)"
      )
      .eq("organization_id", organizationId)
      .in("qc_status", ["Released", "Rejected"])
      .not("qc_tanggal", "is", null)
      .order("qc_tanggal", { ascending: false })
      .limit(15),
  ]);

  const list = (karantina || []) as unknown as BatchRow[];
  const logs = (history || []) as unknown as HistoryRow[];

  return (
    <BahanShell>
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          QC Incoming
        </h2>
        <p className="text-muted text-[12.5px] mt-0.5">
          {list.length} batch menunggu pemeriksaan — barang karantina belum bisa
          dipakai produksi sampai di-release.
        </p>
      </div>

      <div className="mt-4">
        <TableSearch placeholder="Cari item / lot / supplier..." />
      </div>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Item</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Lot Supplier</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Diterima</th>
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Exp</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Qty</th>
              <th className="px-4 py-2.5 font-semibold">Supplier</th>
              <th className="px-4 py-2.5 font-semibold text-right whitespace-nowrap">Lembar Uji</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted py-10 text-sm">
                  Tidak ada batch dalam karantina 🎉 — barang baru dari Receiving
                  akan muncul di sini.
                </td>
              </tr>
            ) : (
              list.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-line last:border-0 bg-amber-100/20"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium max-w-[200px] truncate" title={b.items?.nama}>
                      {b.items?.nama}
                    </div>
                    <div className="text-[11px] text-muted font-mono">{b.items?.kode}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                    {b.no_lot_supplier || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatTanggal(b.tanggal_terima)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                    {b.exp_date
                      ? new Date(b.exp_date + "T00:00:00").toLocaleDateString("id-ID", {
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                    {Number(b.qty_karantina).toLocaleString("id-ID")} {b.items?.satuan}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[150px] truncate text-[12.5px]" title={b.supplier_nama || undefined}>
                      {b.supplier_nama || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/qc-incoming/${b.id}`}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-botanical-700 text-white text-[12px] font-medium hover:bg-botanical-800 transition-colors"
                    >
                      <ClipboardList size={13} /> Uji &amp; Putuskan
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Riwayat keputusan QC ===== */}
      <h3 className="font-display text-[15px] font-semibold text-ink mt-6 mb-2">
        Riwayat Keputusan QC
      </h3>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold whitespace-nowrap">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold">Item</th>
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
                <td colSpan={6} className="text-center text-muted py-8 text-sm">
                  Belum ada riwayat.
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatTanggal(l.qc_tanggal)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[200px] truncate" title={l.items?.nama}>
                      {l.items?.nama}
                    </div>
                    <div className="text-[11px] text-muted font-mono">
                      {l.items?.kode}
                      {l.no_lot_supplier ? ` · lot ${l.no_lot_supplier}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                        l.qc_status === "Released"
                          ? "bg-botanical-100 text-botanical-700"
                          : "bg-clay-100 text-clay-600"
                      }`}
                    >
                      {l.qc_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-[12.5px]">
                    {l.qc_oleh || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[240px] line-clamp-2 text-[12.5px]" title={l.qc_note || undefined}>
                      {l.qc_note || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/qc-incoming/${l.id}/detail`}
                        className="text-botanical-700 text-[12.5px] font-medium hover:underline"
                      >
                        Detail
                      </Link>
                      <Link
                        href={`/print/qc/${l.id}`}
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
    </BahanShell>
  );
}
