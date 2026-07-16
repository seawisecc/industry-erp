import { createClient } from "@/lib/supabase/server";
import { getEffectiveOrg } from "@/lib/getEffectiveOrg";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ExpiryActions from "./ExpiryActions";

type BatchRow = {
  id: string;
  no_lot_supplier: string | null;
  exp_date: string;
  qty_sisa: number;
  supplier_nama: string | null;
  retest_note: string | null;
  items: { kode: string; nama: string; satuan: string } | null;
};

type LogRow = {
  tipe: string;
  qty: number | null;
  exp_lama: string | null;
  exp_baru: string | null;
  catatan: string | null;
  created_at: string;
  items: { nama: string } | null;
};

function formatTanggal(iso: string) {
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ExpiryPage() {
  const supabase = await createClient();
  const { organizationId } = await getEffectiveOrg();

  const todayStr = new Date().toISOString().slice(0, 10);
  const in60 = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

  const [{ data: batches }, { data: logs }] = await Promise.all([
    supabase
      .from("purchase_batches")
      .select(
        "id, no_lot_supplier, exp_date, qty_sisa, supplier_nama, retest_note, items(kode, nama, satuan)"
      )
      .eq("organization_id", organizationId)
      .gt("qty_sisa", 0)
      .not("exp_date", "is", null)
      .lte("exp_date", in60)
      .order("exp_date"),
    supabase
      .from("batch_dispositions")
      .select("tipe, qty, exp_lama, exp_baru, catatan, created_at, items(nama)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const list = (batches || []) as unknown as BatchRow[];
  const logList = (logs || []) as unknown as LogRow[];
  const expiredCount = list.filter((b) => b.exp_date < todayStr).length;

  return (
    <div className="max-w-4xl">
      <Link
        href="/items"
        className="flex items-center gap-1.5 text-muted text-[13px] mb-4 hover:text-ink"
      >
        <ArrowLeft size={15} /> Kembali ke Stock Items
      </Link>

      <h1 className="font-display text-2xl font-semibold text-ink mb-1">
        Expiry Control
      </h1>
      <p className="text-muted text-sm mb-6">
        {list.length} batch mendekati / lewat expired
        {expiredCount > 0 ? ` — ${expiredCount} sudah expired` : ""}. Tindak
        lanjut: Re-test (perpanjang exp) atau Musnahkan.
      </p>

      <div className="glass rounded-2xl overflow-x-auto mb-6">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Item</th>
              <th className="px-4 py-2.5 font-semibold">Lot Supplier</th>
              <th className="px-4 py-2.5 font-semibold">Exp Date</th>
              <th className="px-4 py-2.5 font-semibold text-right">Qty Sisa</th>
              <th className="px-4 py-2.5 font-semibold">Supplier</th>
              <th className="px-4 py-2.5 font-semibold text-right">Tindak Lanjut</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-muted py-10 text-sm">
                  Tidak ada batch yang perlu tindak lanjut 🎉
                </td>
              </tr>
            ) : (
              list.map((b) => {
                const expired = b.exp_date < todayStr;
                return (
                  <tr
                    key={b.id}
                    className={`border-b border-line last:border-0 transition-colors ${
                      expired ? "bg-clay-100/30" : "hover:bg-white/40"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium max-w-[200px] truncate">
                        {b.items?.nama}
                      </div>
                      <div className="text-[11px] text-muted font-mono">
                        {b.items?.kode}
                        {b.retest_note && (
                          <span className="ml-1.5 text-botanical-700">
                            · re-test: {b.retest_note}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] whitespace-nowrap">
                      {b.no_lot_supplier || "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11.5px] font-medium ${
                          expired
                            ? "bg-clay-100 text-clay-600"
                            : "bg-amber-100 text-amber-500"
                        }`}
                      >
                        {formatTanggal(b.exp_date)}
                        {expired ? " · expired" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {Number(b.qty_sisa).toLocaleString("id-ID")} {b.items?.satuan}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="max-w-[150px] truncate text-[12.5px]"
                        title={b.supplier_nama || undefined}
                      >
                        {b.supplier_nama || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ExpiryActions
                        batchId={b.id}
                        itemNama={b.items?.nama || ""}
                        qtySisa={Number(b.qty_sisa)}
                        satuan={b.items?.satuan || ""}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ===== Audit log ===== */}
      <h2 className="font-display text-[15px] font-semibold text-ink mb-2">
        Riwayat Tindak Lanjut
      </h2>
      <div className="glass rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
              <th className="px-4 py-2.5 font-semibold">Tanggal</th>
              <th className="px-4 py-2.5 font-semibold">Item</th>
              <th className="px-4 py-2.5 font-semibold">Tindakan</th>
              <th className="px-4 py-2.5 font-semibold">Detail</th>
            </tr>
          </thead>
          <tbody>
            {logList.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center text-muted py-8 text-sm">
                  Belum ada riwayat.
                </td>
              </tr>
            ) : (
              logList.map((l, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatTanggal(l.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-[200px] truncate">{l.items?.nama}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        l.tipe === "Re-test"
                          ? "bg-botanical-100 text-botanical-700"
                          : "bg-clay-100 text-clay-600"
                      }`}
                    >
                      {l.tipe}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12.5px]">
                    {l.tipe === "Re-test"
                      ? `${l.exp_lama ? formatTanggal(l.exp_lama) : "—"} → ${l.exp_baru ? formatTanggal(l.exp_baru) : "—"}`
                      : `${Number(l.qty || 0).toLocaleString("id-ID")} dimusnahkan`}
                    {l.catatan ? ` · ${l.catatan}` : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
