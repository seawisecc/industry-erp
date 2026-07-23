"use client";

/* ============================================================
   Tombol "Batal Transaksi" — koreksi operasional.
   Muncul hanya untuk user berizin (canCancel). Membuka modal
   konfirmasi + alasan, lalu memanggil server action terkait.
   ============================================================ */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { XCircle, X } from "lucide-react";

type CancelAction = (
  id: string,
  alasan: string
) => Promise<{ ok: boolean; error?: string }>;

export default function CancelTxButton({
  id,
  action,
  canCancel,
  label = "Batalkan Transaksi",
  judul = "Batalkan Transaksi",
  keterangan,
  redirectTo,
  variant = "button",
}: {
  id: string;
  action: CancelAction;
  canCancel: boolean;
  label?: string;
  judul?: string;
  keterangan: string;
  redirectTo?: string;
  variant?: "button" | "link";
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [alasan, setAlasan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setMounted(true), []);
  if (!canCancel) return null;

  async function submit() {
    if (loading) return;
    if (!alasan.trim()) {
      setError("Isi alasan pembatalan dulu");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await action(id, alasan.trim());
      if (res.ok) {
        setOpen(false);
        if (redirectTo) router.push(redirectTo);
        router.refresh();
      } else {
        setError(res.error || "Gagal membatalkan");
        setLoading(false);
      }
    } catch {
      setError("Gagal — koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang lalu coba lagi.");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          variant === "link"
            ? "inline-flex items-center gap-1 text-clay-600 text-[12.5px] font-medium hover:underline"
            : "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-clay-500/40 text-clay-600 text-[12.5px] font-medium hover:bg-clay-100/60 transition-colors"
        }
      >
        <XCircle size={variant === "link" ? 13 : 15} /> {label}
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => !loading && setOpen(false)}
        >
          <div className="absolute inset-0 bg-botanical-900/50 backdrop-blur-[2px]" />
          <div
            className="relative bg-[#FAF7F1] rounded-2xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg p-2 bg-clay-100 text-clay-600">
                  <XCircle size={18} />
                </div>
                <h3 className="font-display text-[16px] font-semibold text-ink">
                  {judul}
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink p-1 -mr-1"
                aria-label="Tutup"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4">
              <p className="text-[12.5px] text-ink/75 leading-relaxed mb-3">
                {keterangan}
              </p>
              <label className="block text-[12px] font-medium text-muted mb-1.5">
                Alasan pembatalan
              </label>
              <textarea
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                rows={2}
                placeholder="mis. salah input jumlah, salah pilih supplier"
                className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-clay-500"
              />
              {error && <p className="text-clay-600 text-[12px] mt-2">{error}</p>}
            </div>

            <div className="flex items-center gap-2 px-5 pb-5">
              <button
                onClick={submit}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-1.5 bg-clay-600 text-white text-[13px] font-medium py-2.5 rounded-lg hover:bg-clay-500 transition-colors disabled:opacity-60"
              >
                <XCircle size={15} />
                {loading ? "Membatalkan..." : "Ya, Batalkan"}
              </button>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="px-4 py-2.5 rounded-lg border border-line text-[13px] font-medium text-muted hover:bg-white/60 transition-colors"
              >
                Tidak
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
