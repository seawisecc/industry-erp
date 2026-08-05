"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseReturn } from "./actions";
import { ALASAN_RETUR } from "@/lib/purchaseReturn";
import DataTable from "@/components/DataTable";

export type ReturBatch = {
  id: string;
  item_nama: string;
  item_kode: string;
  satuan: string;
  no_lot: string | null;
  exp_date: string | null;
  harga_per_unit: number;
  qty_masuk: number;
  /** maksimal yang masih bisa diretur untuk batch ini */
  maks: number;
  qc_status: string | null;
  /** true bila stoknya sudah hangus saat QC menolak */
  stokSudahHangus: boolean;
};

export type ReturFaktur = {
  id: string;
  no_invoice: string | null;
  no_po: string | null;
  tanggal_terima: string;
  supplier_nama: string | null;
  ppn_percent: number;
  total_invoice: number;
  total_retur: number;
  sisa: number;
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}
function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

export default function PurchaseReturnForm({
  faktur,
  batches,
  hariIni,
}: {
  faktur: ReturFaktur;
  batches: ReturBatch[];
  /** Tanggal kalender zona operasional, dihitung di server (lib/dates.ts) */
  hariIni: string;
}) {
  const router = useRouter();
  const [tanggal, setTanggal] = useState(hariIni);
  const [alasan, setAlasan] = useState<string>(ALASAN_RETUR[0]);
  const [catatan, setCatatan] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const qtyOf = (id: string) => parseNum(qty[id] || "");

  const subtotal = batches.reduce(
    (s, b) => s + qtyOf(b.id) * Number(b.harga_per_unit),
    0
  );
  const ppn = subtotal * (Number(faktur.ppn_percent) || 0) / 100;
  const totalNilai = subtotal + ppn;

  const adaLebih = batches.some((b) => qtyOf(b.id) > b.maks + 0.000001);
  const lebihDariFaktur = totalNilai > faktur.sisa + 0.01;
  const adaIsi = batches.some((b) => qtyOf(b.id) > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await createPurchaseReturn({
        tanggal,
        receiving_id: faktur.id,
        alasan,
        catatan: catatan.trim() || null,
        items: batches
          .filter((b) => qtyOf(b.id) > 0)
          .map((b) => ({ batch_id: b.id, qty: qtyOf(b.id) })),
      });
      if (result.ok && result.id) {
        router.push(`/purchase-returns/${result.id}`);
        router.refresh();
      } else {
        setError(result.error || "Gagal menyimpan");
        setLoading(false);
      }
    } catch {
      setError(
        "Gagal menyimpan. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Tanggal Retur</label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Alasan Retur</label>
          <select
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            className={inputCls}
          >
            {ALASAN_RETUR.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>
            Catatan <span className="font-normal text-muted/70">(opsional)</span>
          </label>
          <input
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Keterangan untuk supplier"
            className={inputCls}
          />
        </div>
      </div>

      <div className="glass rounded-2xl p-5 sm:p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Barang yang Dikembalikan
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Isi qty pada lot yang dikembalikan. Kolom Maks Retur sudah
            memperhitungkan stok terpakai dan retur sebelumnya.
          </p>
        </div>

        <DataTable
          rows={batches}
          rowKey={(b) => b.id}
          minWidth={820}
          chrome="bare"
          expandable={false}
          empty="Tidak ada batch pada faktur ini yang bisa diretur."
          columns={[
            {
              key: "item",
              header: "Barang",
              role: "title",
              cell: (b) => (
                <>
                  <div className="font-medium">{b.item_nama}</div>
                  <div className="text-[11px] text-muted font-mono">
                    {b.item_kode} · lot {b.no_lot || "-"}
                  </div>
                </>
              ),
              cardCell: (b) => (
                <>
                  <div>{b.item_nama}</div>
                  <div className="text-[11px] text-muted font-mono font-normal">
                    {b.item_kode} · lot {b.no_lot || "-"}
                  </div>
                </>
              ),
            },
            {
              key: "status",
              header: "Status QC",
              role: "badge",
              cell: (b) =>
                b.stokSudahHangus ? (
                  <span
                    className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-500 whitespace-nowrap"
                    title="Stok sudah dihapus saat QC menolak, retur ini hanya memotong tagihan"
                  >
                    Ditolak QC
                  </span>
                ) : (
                  <span className="text-muted text-[12px] whitespace-nowrap">
                    {b.qc_status || "-"}
                  </span>
                ),
            },
            {
              key: "masuk",
              header: "Qty Diterima",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (b) => `${formatId(Number(b.qty_masuk))} ${b.satuan}`,
            },
            {
              key: "maks",
              header: "Maks Retur",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (b) => `${formatId(b.maks)} ${b.satuan}`,
            },
            {
              key: "harga",
              header: "Harga/Unit",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap",
              cell: (b) => formatRupiah(Number(b.harga_per_unit)),
            },
            {
              key: "qty",
              header: "Qty Retur",
              role: "primary",
              headClassName: "w-[130px]",
              cell: (b) => {
                const lebih = qtyOf(b.id) > b.maks + 0.000001;
                return (
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Qty retur ${b.item_nama}`}
                    value={qty[b.id] || ""}
                    onChange={(e) =>
                      setQty((s) => ({ ...s, [b.id]: e.target.value }))
                    }
                    placeholder="0"
                    disabled={b.maks <= 0}
                    className={`${inputCls} text-right disabled:opacity-40 ${
                      lebih ? "ring-2 ring-clay-500" : ""
                    }`}
                  />
                );
              },
            },
            {
              key: "subtotal",
              header: "Subtotal",
              role: "primary",
              align: "right",
              className: "whitespace-nowrap font-medium",
              cell: (b) =>
                qtyOf(b.id) > 0
                  ? formatRupiah(qtyOf(b.id) * Number(b.harga_per_unit))
                  : "-",
            },
          ]}
        />
      </div>

      {/* ===== Nilai retur & dampaknya ke hutang ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-2 sm:max-w-sm sm:ml-auto sm:w-full text-[13.5px]">
        <div className="flex justify-between">
          <span className="text-muted">Sub-Total</span>
          <span>{formatRupiah(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">
            PPN {Number(faktur.ppn_percent).toLocaleString("id-ID")}%
          </span>
          <span>{formatRupiah(ppn)}</span>
        </div>
        <div className="flex justify-between font-semibold text-[15px] border-t border-line pt-2 mt-1">
          <span>NILAI RETUR</span>
          <span>{formatRupiah(totalNilai)}</span>
        </div>
        <div className="flex justify-between text-[12px] text-muted pt-1">
          <span>Sisa tagihan setelah retur</span>
          <span>{formatRupiah(Math.max(faktur.sisa - totalNilai, 0))}</span>
        </div>
      </div>

      {lebihDariFaktur && (
        <p className="text-clay-600 text-[12.5px]">
          Nilai retur melebihi sisa tagihan faktur ini (
          {formatRupiah(faktur.sisa)}).
        </p>
      )}
      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || adaLebih || lebihDariFaktur || !adaIsi}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Menyimpan..." : "Terbitkan Retur"}
      </button>
      <p className="text-muted text-[12px] text-center -mt-3">
        Stok berkurang untuk lot yang barangnya masih ada. Lot yang sudah
        ditolak QC stoknya tidak dipotong lagi, hanya tagihannya yang
        berkurang.
      </p>
    </form>
  );
}
