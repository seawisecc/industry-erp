"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MonitorDown, Share, SquarePlus, X } from "lucide-react";
import {
  langganiStatus,
  mintaPasang,
  statusAwal,
  statusPasang,
} from "@/lib/pwaInstall";

/**
 * Tombol pasang aplikasi (PWA).
 *
 * Tidak merender apa pun kalau browsernya tidak bisa memasang, atau
 * kalau aplikasinya memang sudah dipasang dan sedang dibuka dari home
 * screen. Tombol yang tidak bisa melakukan apa-apa lebih buruk daripada
 * tidak ada tombol, dan di sini bahkan menyesatkan: orang akan mengira
 * pemasangannya gagal.
 *
 * Di iOS tombolnya tetap muncul tapi isinya petunjuk, karena Safari
 * tidak menyediakan dialog pasang yang bisa dipanggil aplikasi.
 */
export default function InstallAppButton({
  variant = "icon",
}: {
  variant?: "icon" | "login";
}) {
  const status = useSyncExternalStore(langganiStatus, statusPasang, statusAwal);
  const [petunjukTerbuka, setPetunjukTerbuka] = useState(false);

  if (status === "terpasang" || status === "tidak-bisa") return null;

  const judul =
    status === "ios" ? "Cara pasang di iPhone / iPad" : "Pasang aplikasi";

  async function handleKlik() {
    if (status === "ios") {
      setPetunjukTerbuka(true);
      return;
    }
    await mintaPasang();
  }

  return (
    <>
      {variant === "login" ? (
        <button
          type="button"
          onClick={handleKlik}
          className="inline-flex items-center gap-2 text-[12.5px] font-medium text-botanical-700 border border-botanical-700/30 rounded-lg px-3.5 py-2 hover:bg-botanical-700/8 transition-colors"
        >
          <MonitorDown size={15} /> Pasang Aplikasi
        </button>
      ) : (
        <button
          type="button"
          onClick={handleKlik}
          title={judul}
          aria-label={judul}
          className="text-white/50 hover:text-white p-1 transition-colors"
        >
          <MonitorDown size={16} />
        </button>
      )}

      {petunjukTerbuka && <PetunjukIos tutup={() => setPetunjukTerbuka(false)} />}
    </>
  );
}

/**
 * Portal ke document.body, alasannya sama dengan dialog di dalam sel
 * tabel: sidebar punya backdrop-filter, dan leluhur ber-filter menjadi
 * containing block untuk position:fixed. Tanpa portal, overlay-nya cuma
 * menutupi sidebar.
 */
function PetunjukIos({ tutup }: { tutup: () => void }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/45 flex items-center justify-center p-4"
      onClick={tutup}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-[340px] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <h2 className="font-display text-[16px] font-semibold text-ink flex-1">
            Pasang di iPhone / iPad
          </h2>
          <button
            onClick={tutup}
            aria-label="Tutup"
            className="text-muted hover:text-ink -mt-0.5"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-[12.5px] text-muted leading-relaxed mb-4">
          Safari tidak punya tombol pasang otomatis, jadi dua langkah ini
          dikerjakan sendiri lewat menu Safari:
        </p>
        <ol className="flex flex-col gap-3 text-[13px] text-ink">
          <li className="flex gap-2.5 items-start">
            <Share size={17} className="shrink-0 mt-0.5 text-botanical-700" />
            <span>
              Ketuk tombol <b>Bagikan</b> di bilah bawah Safari.
            </span>
          </li>
          <li className="flex gap-2.5 items-start">
            <SquarePlus size={17} className="shrink-0 mt-0.5 text-botanical-700" />
            <span>
              Pilih <b>Tambahkan ke Layar Utama</b>, lalu ketuk{" "}
              <b>Tambahkan</b>.
            </span>
          </li>
        </ol>
        <p className="text-[11.5px] text-muted leading-relaxed mt-4">
          Kalau menu itu tidak ada, halaman ini sedang dibuka di Chrome
          atau Firefox. Buka lewat Safari dulu.
        </p>
      </div>
    </div>,
    document.body
  );
}
