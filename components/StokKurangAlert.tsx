/* ============================================================
   Panel peringatan "stok bahan tidak cukup".

   Dipakai di dua tempat sepanjang alur produksi (form Plan dan layar
   Execution) supaya kalimat, urutan angka, dan warnanya persis sama.
   Operator yang sudah pernah melihatnya di satu layar langsung
   mengenalinya di layar berikutnya.

   Angkanya selalu bertiga dan berurutan: butuh, stok, kurang. Cuma
   menampilkan "kurang" memaksa orang menghitung mundur untuk tahu
   harus beli berapa.
   ============================================================ */

import Link from "next/link";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import type { Kekurangan } from "@/lib/stokCek";

function formatNum(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}

export default function StokKurangAlert({
  kekurangan,
  keterangan,
  ppicHref,
}: {
  kekurangan: Kekurangan[];
  /** Satu kalimat konteks, mis. "untuk 2 batch (200 kg ruahan)". */
  keterangan?: string;
  /** Tautan ke PPIC Planner, null bila user tidak punya akses modulnya. */
  ppicHref?: string | null;
}) {
  if (kekurangan.length === 0) return null;

  return (
    <div className="glass rounded-2xl border-clay-500/40 p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <span className="bg-clay-100 text-clay-600 rounded-lg p-1.5 flex-shrink-0">
          <AlertTriangle size={16} />
        </span>
        <div className="min-w-0">
          <div className="font-display text-[14.5px] font-semibold text-ink">
            Stok tidak cukup untuk {kekurangan.length} bahan
          </div>
          <p className="text-muted text-[12.5px] mt-0.5 leading-snug">
            Kebutuhan {keterangan ? `${keterangan} ` : ""}melebihi stok yang
            sudah lolos QC dan siap dipakai. Stok baru dipotong saat Input
            Hasil, jadi produksi tetap bisa dimulai, tapi akan tertahan di
            akhir kalau bahannya belum datang.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {kekurangan.map((k) => (
          <div
            key={k.item_id}
            className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-3 rounded-lg bg-clay-100/40 px-3 py-2"
          >
            <div className="min-w-0">
              <span className="font-mono text-[11.5px] text-muted">{k.kode}</span>{" "}
              <span className="text-[13px] font-medium text-ink">{k.nama}</span>
            </div>
            <div className="text-[12px] whitespace-nowrap flex-shrink-0">
              <span className="text-muted">
                butuh {formatNum(k.butuh)} · stok {formatNum(k.stok)}
              </span>{" "}
              <span className="text-clay-600 font-semibold">
                kurang {formatNum(k.kurang)} {k.satuan}
              </span>
            </div>
          </div>
        ))}
      </div>

      {ppicHref && (
        <Link
          href={ppicHref}
          className="inline-flex items-center gap-1.5 text-botanical-700 text-[12.5px] font-medium hover:underline"
        >
          <ShoppingCart size={14} /> Susun rencana pembelian di PPIC Planner
        </Link>
      )}
    </div>
  );
}
