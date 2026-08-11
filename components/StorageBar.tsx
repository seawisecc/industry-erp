/* ============================================================
   Bar pemakaian penyimpanan.

   Sengaja presentasional murni (tanpa "use client") supaya bisa
   dipakai dari server component halaman Companies maupun dari kartu
   Settings yang punya tombol.

   Persentase ditampilkan bersama angka absolutnya, bukan sendirian:
   "97%" tidak memberi tahu berapa GB yang harus ditagih, dan
   "9,7 GB" tidak memberi tahu seberapa dekat batasnya.
   ============================================================ */

import {
  formatBytes,
  persenStr,
  toneStorage,
  type PemakaianStorage,
} from "@/lib/storage";

export default function StorageBar({
  pakai,
  ringkas = false,
}: {
  pakai: PemakaianStorage;
  /** Versi sel tabel: satu baris, bar tipis, tanpa keterangan kuota */
  ringkas?: boolean;
}) {
  const tone = toneStorage(pakai);
  // Bar-nya berhenti di 100% walau pemakaiannya lewat, bar yang
  // meluber keluar kotaknya tidak menambah informasi apa pun.
  const lebar = Math.min(100, Math.max(pakai.bytes > 0 ? 2 : 0, pakai.persen));

  return (
    <div className={ringkas ? "min-w-[120px]" : ""}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-medium ${tone.teks}`}>
          {formatBytes(pakai.bytes)}
        </span>
        <span className="text-[11.5px] text-muted whitespace-nowrap">
          {ringkas
            ? persenStr(pakai.persen)
            : `dari ${pakai.quotaGb.toLocaleString("id-ID")} GB · ${persenStr(
                pakai.persen
              )}`}
        </span>
      </div>
      <div
        className={`mt-1 w-full rounded-full bg-line/70 overflow-hidden ${
          ringkas ? "h-1.5" : "h-2.5"
        }`}
      >
        <div
          className={`h-full rounded-full ${tone.bar}`}
          style={{ width: `${lebar}%` }}
        />
      </div>
      {pakai.lewatKuota ? (
        <div className="mt-1 text-[11px] text-clay-600 font-medium">
          ⚠ Lewat kuota +
          {formatBytes(pakai.bytes - pakai.quotaGb * 1024 ** 3)}
        </div>
      ) : pakai.mendekatiBatas ? (
        <div className="mt-1 text-[11px] text-amber-500 font-medium">
          ⚠ Mendekati batas
        </div>
      ) : null}
    </div>
  );
}
