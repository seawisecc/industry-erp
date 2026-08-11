"use client";

/* ============================================================
   Error boundary untuk seluruh halaman aplikasi.
   Tanpa ini, satu query yang gagal bikin user kena layar error
   bawaan Next.js berbahasa Inggris tanpa jalan keluar.
   ============================================================ */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="glass rounded-2xl p-8 sm:p-10 max-w-md mx-auto mt-10 sm:mt-16 text-center">
      <div className="inline-flex bg-clay-100 text-clay-600 rounded-xl p-3 mb-4">
        <AlertTriangle size={22} />
      </div>
      <h1 className="font-display text-xl font-semibold text-ink mb-2">
        Ada Yang Bermasalah
      </h1>
      <p className="text-muted text-sm mb-5 leading-relaxed">
        Halaman ini gagal dimuat. Biasanya karena koneksi terputus atau
        aplikasi baru saja diperbarui. Coba muat ulang dulu. Datamu aman,
        tidak ada yang tersimpan setengah jalan.
      </p>

      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        <button
          onClick={reset}
          className="inline-flex items-center justify-center gap-2 bg-botanical-700 text-white text-[13.5px] font-medium px-4 py-2.5 rounded-lg hover:bg-botanical-800 transition-colors"
        >
          <RotateCw size={15} /> Coba Lagi
        </button>
        {/* Tujuannya "/" bukan "/dashboard". Ini komponen error boundary
            di sisi klien, dia tidak tahu hak akses siapa pun, dan dashboard
            adalah modul yang bisa tidak diberikan. "/" menyerahkan
            keputusannya ke server yang memang tahu. */}
        <Link
          href="/"
          className="inline-flex items-center justify-center border border-line text-ink text-[13.5px] font-medium px-4 py-2.5 rounded-lg hover:bg-white/50 transition-colors"
        >
          Kembali ke Beranda
        </Link>
      </div>

      {error.digest && (
        <p className="text-muted text-[11px] mt-5 font-mono">
          Kode error: {error.digest}
        </p>
      )}
    </div>
  );
}
