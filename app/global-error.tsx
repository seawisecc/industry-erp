"use client";

/* ============================================================
   Jaring pengaman terakhir: error yang terjadi di root layout
   sendiri. File ini menggantikan seluruh dokumen, jadi harus
   merender <html>/<body> sendiri dan mengimpor style-nya.
   ============================================================ */

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
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
    <html lang="id">
      <body>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="glass rounded-3xl p-8 sm:p-10 max-w-md text-center">
            <h1 className="font-display text-[22px] font-semibold text-ink mb-2">
              Aplikasi Gagal Dimuat
            </h1>
            <p className="text-muted text-[13.5px] leading-relaxed mb-6">
              Terjadi kesalahan yang membuat aplikasi tidak bisa ditampilkan.
              Muat ulang halaman untuk mencoba lagi. Kalau terus berulang,
              hubungi tim Seawise dengan menyertakan kode error di bawah.
            </p>
            <button
              onClick={reset}
              className="bg-botanical-700 text-white text-[13.5px] font-medium px-5 py-2.5 rounded-lg hover:bg-botanical-800 transition-colors"
            >
              Muat Ulang
            </button>
            {error.digest && (
              <p className="text-muted text-[11px] mt-5 font-mono">
                Kode error: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
