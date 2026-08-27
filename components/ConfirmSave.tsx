"use client";

/**
 * Dialog "yakin simpan?" yang dipakai SELURUH form penyimpan data.
 *
 * Dipakai lewat hook, bukan dengan membungkus tombol, supaya validasi
 * bawaan browser (`required`, `type="number"`) tetap jalan lebih dulu:
 * dialognya baru muncul sesudah form dinyatakan sah, bukan begitu
 * tombolnya disentuh.
 *
 *   const konfirmasi = useConfirmSave();
 *
 *   async function handleSubmit(e) {
 *     e.preventDefault();
 *     if (loading) return;
 *     const lanjut = await konfirmasi.minta({
 *       judul: isEdit ? "Simpan perubahan client?" : "Tambah client baru?",
 *       ringkasan: [{ label: "Nama", nilai: nama }],
 *     });
 *     if (!lanjut) return;
 *     ...
 *   }
 *
 *   <form onSubmit={handleSubmit}>… {konfirmasi.dialog}</form>
 *
 * Ringkasannya wajib diisi hal yang benar-benar bisa dicek sekilas
 * (nama, nomor, jumlah baris, total). Dialog yang isinya cuma "Yakin?"
 * dalam sebulan akan diklik tanpa dibaca.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check } from "lucide-react";

export type RingkasanBaris = { label: string; nilai: string };

export type IsiKonfirmasi = {
  judul: string;
  /** Kalimat penjelas di bawah judul, untuk akibat yang tidak terlihat di form. */
  pesan?: string;
  ringkasan?: RingkasanBaris[];
  /** Teks tombol utama. Default "Ya, Simpan". */
  tombol?: string;
  /** "bahaya" untuk yang memotong stok / tidak bisa dibatalkan. */
  nada?: "simpan" | "bahaya";
};

export function useConfirmSave() {
  const [isi, setIsi] = useState<IsiKonfirmasi | null>(null);
  const jawab = useRef<((ok: boolean) => void) | null>(null);

  const minta = useCallback((baru: IsiKonfirmasi) => {
    // Kalau ada dialog yang belum dijawab, anggap batal supaya
    // promise-nya tidak menggantung selamanya.
    jawab.current?.(false);
    setIsi(baru);
    return new Promise<boolean>((resolve) => {
      jawab.current = resolve;
    });
  }, []);

  const tutup = useCallback((ok: boolean) => {
    setIsi(null);
    const f = jawab.current;
    jawab.current = null;
    f?.(ok);
  }, []);

  return {
    minta,
    dialog: isi ? <ConfirmDialog isi={isi} onJawab={tutup} /> : null,
  };
}

function ConfirmDialog({
  isi,
  onJawab,
}: {
  isi: IsiKonfirmasi;
  onJawab: (ok: boolean) => void;
}) {
  const tombolRef = useRef<HTMLButtonElement>(null);
  const bahaya = isi.nada === "bahaya";

  useEffect(() => {
    tombolRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onJawab(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onJawab]);

  // Portal ke <body>: form-nya berada di dalam panel .glass yang punya
  // backdrop-filter, dan itu menjadikan panel tersebut containing block
  // untuk position:fixed. Tanpa portal dialognya terkurung di dalam kartu.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={() => onJawab(false)}
      role="dialog"
      aria-modal="true"
      aria-label={isi.judul}
    >
      <div className="absolute inset-0 bg-botanical-900/50 backdrop-blur-[2px]" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-[#FAF7F1] rounded-2xl shadow-2xl w-full max-w-md"
      >
        <div className="flex items-start gap-2.5 px-5 pt-5 pb-3">
          <div
            className={`rounded-lg p-2 shrink-0 ${
              bahaya ? "bg-clay-100 text-clay-600" : "bg-botanical-100 text-botanical-700"
            }`}
          >
            {bahaya ? <AlertTriangle size={18} /> : <Check size={18} />}
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-[16px] font-semibold text-ink leading-snug">
              {isi.judul}
            </h3>
            {isi.pesan && (
              <p className="text-[12.5px] text-muted mt-1">{isi.pesan}</p>
            )}
          </div>
        </div>

        {isi.ringkasan && isi.ringkasan.length > 0 && (
          <dl className="mx-5 mb-1 rounded-xl border border-line divide-y divide-line bg-white/60">
            {isi.ringkasan.map((b) => (
              <div key={b.label} className="flex gap-3 px-3.5 py-2">
                <dt className="text-[12px] text-muted shrink-0 w-[38%]">{b.label}</dt>
                <dd className="text-[12.5px] text-ink font-medium min-w-0 break-words">
                  {b.nilai}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex gap-2 px-5 py-4">
          <button
            ref={tombolRef}
            type="button"
            onClick={() => onJawab(true)}
            className={`flex-1 rounded-lg py-2.5 text-[13px] font-medium text-white transition-colors ${
              bahaya
                ? "bg-clay-600 hover:bg-clay-500"
                : "bg-botanical-700 hover:bg-botanical-800"
            }`}
          >
            {isi.tombol || "Ya, Simpan"}
          </button>
          <button
            type="button"
            onClick={() => onJawab(false)}
            className="px-4 py-2.5 rounded-lg text-[13px] font-medium text-muted hover:text-ink hover:bg-black/[0.04] transition-colors"
          >
            Periksa Lagi
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
