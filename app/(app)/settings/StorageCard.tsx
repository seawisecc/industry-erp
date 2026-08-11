/* ============================================================
   Kartu pemakaian penyimpanan milik organisasi sendiri.

   Ada di Settings supaya client bisa mengerem sendiri sebelum kena
   biaya tambahan. Tagihan yang datang sebagai kejutan adalah tagihan
   yang diperdebatkan.

   Sepuluh tabel terbesarnya ikut ditampilkan, dan itu bukan hiasan:
   yang membengkak hampir selalu `activity_logs` (satu baris per item
   yang diimpor CSV — lihat Known Issue di CLAUDE.md). Tanpa rincian
   ini, client cuma tahu "penuh" tanpa tahu apa yang memenuhinya.
   ============================================================ */

import StorageBar from "@/components/StorageBar";
import StorageRefresh from "../companies/StorageRefresh";
import {
  bacaPemakaian,
  formatBytes,
  type StorageRow,
} from "@/lib/storage";

export default function StorageCard({
  row,
  quotaGb,
}: {
  row: StorageRow | null;
  quotaGb: number | null;
}) {
  const pakai = bacaPemakaian(row, quotaGb);

  return (
    <div className="glass rounded-2xl p-6 mt-5">
      <h3 className="font-display text-[15px] font-semibold text-ink">
        Penyimpanan
      </h3>
      <p className="text-muted text-[12.5px] mt-0.5 mb-4">
        Kuota {pakai.quotaGb.toLocaleString("id-ID")} GB. Pemakaian di atas
        kuota tidak menghentikan transaksi apa pun, tapi menimbulkan biaya
        tambahan — hubungi Seawise Studio kalau butuh kuota lebih besar.
      </p>

      <div className="max-w-md">
        <StorageBar pakai={pakai} />
      </div>

      <div className="mt-4 text-[12.5px] text-muted">
        {pakai.baris.toLocaleString("id-ID")} baris data
      </div>

      {pakai.perTabel.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wide text-muted mb-2">
            Penyumbang Terbesar
          </div>
          <div className="flex flex-col gap-1.5 max-w-md">
            {pakai.perTabel.slice(0, 5).map((t) => (
              <div
                key={t.tabel}
                className="flex items-baseline justify-between gap-3 text-[12.5px]"
              >
                <span className="font-mono text-[11.5px] truncate">
                  {t.tabel}
                </span>
                <span className="whitespace-nowrap">
                  {formatBytes(Number(t.bytes))}
                  <span className="text-muted text-[11.5px]">
                    {" "}
                    · {Number(t.baris).toLocaleString("id-ID")} baris
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-line">
        <StorageRefresh dihitungPada={pakai.dihitungPada} />
      </div>

      <p className="text-[11.5px] text-muted mt-3">
        Angka ini estimasi: ukuran tiap tabel (termasuk index) dibagi menurut
        jumlah baris milik tiap perusahaan, lalu dijumlahkan.
      </p>
    </div>
  );
}
