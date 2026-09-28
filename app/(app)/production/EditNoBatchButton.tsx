"use client";

/* ============================================================
   Betulkan nomor batch yang salah ketik, dan untuk batch yang sudah
   jadi (prop `hasil`), qty hasil per varian yang salah input.

   Qty hasil cuma bisa dibetulkan untuk varian yang memang ada di
   batch itu. Stok produk jadi dan HPP per pcs ikut bergeser dengan
   sendirinya karena dua-duanya dihitung dari qty_hasil. Penjaga
   "tidak boleh turun di bawah yang sudah terjual" ada di RPC
   (update_production_result_tx), dialog ini cuma menampilkan pesannya.

   Muncul hanya untuk user yang boleh membuat instruksi produksi
   (canEdit), izin yang sama dengan pembuat plan-nya.

   Dialognya lewat createPortal ke document.body: tombolnya duduk
   di dalam sel DataTable, dan pembungkus tabel punya
   backdrop-filter + overflow-auto sehingga `fixed inset-0` di
   dalamnya akan menempel ke panel tabel, bukan ke layar. Lihat
   bab "Pola UI tabel" di CLAUDE.md.
   ============================================================ */

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { ActionTip, iconActionClass } from "@/components/RowActions";
import NumberInput from "@/components/NumberInput";
import type { ActionResult } from "@/lib/actionResult";
import type { HasilKoreksi } from "./actions";

type HasilBaris = {
  varian_ukuran: string | null;
  qty_hasil: number;
  satuan: string;
};

export default function EditNoBatchButton({
  id,
  noSekarang,
  action,
  canEdit,
  hasil,
  variant = "icon",
}: {
  id: string;
  noSekarang: string;
  action: (
    id: string,
    noBaru: string,
    hasil?: HasilKoreksi[]
  ) => Promise<ActionResult>;
  canEdit: boolean;
  /** Hasil batch yang sudah jadi. Diisi = qty hasilnya ikut bisa dibetulkan. */
  hasil?: HasilBaris[];
  /** "icon" untuk kolom aksi tabel, "button" untuk kepala halaman detail */
  variant?: "icon" | "button";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [no, setNo] = useState(noSekarang);
  const [qty, setQty] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!canEdit) return null;

  const labelAksi = hasil ? "Edit no. batch & hasil" : "Edit no. batch";

  function buka() {
    setNo(noSekarang);
    setQty((hasil || []).map((h) => String(Number(h.qty_hasil))));
    setError("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const bersih = no.trim();
    if (!bersih) {
      setError("No. batch wajib diisi");
      return;
    }
    const angka = qty.map((q) => Number(q));
    if (hasil && qty.some((q) => q.trim() === "" || !(Number(q) >= 0))) {
      setError("Qty hasil wajib diisi, isi 0 kalau memang tidak ada");
      return;
    }
    const qtyBerubah =
      !!hasil && hasil.some((h, i) => angka[i] !== Number(h.qty_hasil));
    if (hasil && qtyBerubah && angka.reduce((a, b) => a + b, 0) <= 0) {
      setError("Minimal satu varian dengan hasil lebih dari 0");
      return;
    }
    if (bersih === noSekarang && !qtyBerubah) {
      setOpen(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await action(
        id,
        bersih,
        qtyBerubah && hasil
          ? hasil.map((h, i) => ({
              varian_ukuran: h.varian_ukuran,
              qty_hasil: angka[i],
            }))
          : undefined
      );
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error || "Gagal menyimpan perubahan");
      }
    } catch {
      setError(
        "Gagal, koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang lalu coba lagi."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {variant === "icon" ? (
        <ActionTip label={labelAksi}>
          <button
            onClick={buka}
            aria-label={labelAksi}
            className={iconActionClass()}
          >
            <Pencil size={15} />
          </button>
        </ActionTip>
      ) : (
        <button
          onClick={buka}
          className="inline-flex items-center gap-1.5 h-9 bg-white/70 border border-line text-ink text-[12.5px] font-medium px-3 rounded-lg hover:bg-white transition-colors whitespace-nowrap"
        >
          <Pencil size={14} /> {hasil ? "Edit Batch" : "Edit No. Batch"}
        </button>
      )}

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            onClick={() => !loading && setOpen(false)}
          >
            <div className="absolute inset-0 bg-botanical-900/50 backdrop-blur-[2px]" />
            <form
              onSubmit={submit}
              className="relative bg-[#FAF7F1] rounded-2xl shadow-2xl w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-line">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg p-2 bg-botanical-100 text-botanical-700">
                    <Pencil size={18} />
                  </div>
                  <h3 className="font-display text-[16px] font-semibold text-ink">
                    {hasil ? "Ubah No. Batch & Hasil" : "Ubah No. Batch"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-muted hover:text-ink p-1 -mr-1"
                  aria-label="Tutup"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-4">
                <p className="text-[12.5px] text-ink/75 leading-relaxed mb-3">
                  Nomor lama <span className="font-mono">{noSekarang}</span>{" "}
                  diganti di instruksi produksi sekaligus batch record-nya.
                  Dokumen yang sudah terlanjur dicetak perlu dicetak ulang.
                </p>
                <label className="block text-[12px] font-medium text-muted mb-1.5">
                  No. Batch
                </label>
                <input
                  value={no}
                  onChange={(e) => setNo(e.target.value)}
                  autoFocus
                  className="w-full glass-input rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-botanical-700"
                />
                {hasil && hasil.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[12px] font-medium text-muted mb-1.5">
                      Jumlah Hasil
                    </div>
                    <div className="space-y-2">
                      {hasil.map((h, i) => (
                        <div key={h.varian_ukuran ?? i} className="flex items-center gap-2">
                          <span className="flex-1 min-w-0 truncate text-[13px] text-ink">
                            {h.varian_ukuran || "Hasil"}
                          </span>
                          <NumberInput
                            value={qty[i] ?? ""}
                            onChange={(nilai) =>
                              setQty((lama) =>
                                lama.map((q, j) => (j === i ? nilai : q))
                              )
                            }
                            bulat
                            aria-label={`Qty hasil ${h.varian_ukuran || ""}`}
                            className="w-28 glass-input rounded-lg px-3 py-2 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-botanical-700"
                          />
                          <span className="w-8 text-[12px] text-muted">
                            {h.satuan}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11.5px] text-muted leading-relaxed mt-2">
                      Stok produk jadi dan HPP per pcs ikut menyesuaikan. Bahan
                      yang sudah terpotong tidak berubah; kalau yang salah
                      takaran bahannya, pakai Batal Produksi. Qty tidak bisa
                      diturunkan di bawah jumlah yang sudah terjual atau
                      dikonsinyasi.
                    </p>
                  </div>
                )}
                {error && (
                  <p className="text-clay-600 text-[12px] mt-2">{error}</p>
                )}
              </div>

              <div className="flex items-center gap-2 px-5 pb-5">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium py-2.5 rounded-lg hover:bg-botanical-800 transition-colors disabled:opacity-60"
                >
                  <Pencil size={15} />
                  {loading ? "Menyimpan..." : "Simpan"}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-lg border border-line text-[13px] font-medium text-muted hover:bg-white/60 transition-colors"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </>
  );
}
