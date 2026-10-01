"use client";

/* ============================================================
   Aksi di halaman detail quotation: ganti status, hapus, dan
   terbitkan Proforma.

   Terbitkan Proforma berbentuk panel sendiri (tanggal, TOP, Cust. PO),
   jadi tidak ditumpuk dialog ConfirmSave lagi: panelnya sudah
   menuntut dua langkah sadar, aturan yang sama dengan PaymentPanel.
   ============================================================ */

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { FileText, Send, ThumbsDown, ThumbsUp, Trash2, Undo2, X } from "lucide-react";
import { useConfirmSave } from "@/components/ConfirmSave";
import NumberInput from "@/components/NumberInput";
import { addDaysStr, localDateStr } from "@/lib/dates";
import {
  deleteQuotation,
  issueProformaFromQuotation,
  setQuotationStatus,
} from "../actions";

function formatRupiah(n: number) {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

const tombolCls =
  "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[12.5px] font-medium transition-colors disabled:opacity-60";
const tombolGaris = `${tombolCls} border border-line text-ink hover:bg-white/60`;

export default function QuotationActions({
  id,
  noQuotation,
  kepada,
  status,
  total,
  sudahProforma,
}: {
  id: string;
  noQuotation: string;
  kepada: string;
  status: string;
  total: number;
  sudahProforma: boolean;
}) {
  const router = useRouter();
  const konfirmasi = useConfirmSave();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [panel, setPanel] = useState(false);
  const [tanggal, setTanggal] = useState(localDateStr());
  const [top, setTop] = useState("");
  const [catatan, setCatatan] = useState("");
  const [panelError, setPanelError] = useState("");

  const ringkasan = [
    { label: "No.", nilai: noQuotation },
    { label: "Kepada", nilai: kepada },
    { label: "Total", nilai: formatRupiah(total) },
  ];

  async function jalankan(
    aksi: () => Promise<{ ok: true } | { ok: false; error: string }>,
    sesudah?: () => void
  ) {
    setLoading(true);
    setError("");
    try {
      const res = await aksi();
      if (res.ok) {
        if (sesudah) sesudah();
        else router.refresh();
      } else {
        setError(res.error);
      }
    } catch {
      setError(
        "Gagal, koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang lalu coba lagi."
      );
    }
    setLoading(false);
  }

  async function gantiStatus(ke: string, judul: string, pesan?: string) {
    if (loading) return;
    const lanjut = await konfirmasi.minta({
      judul,
      pesan,
      ringkasan,
      tombol: "Ya, Ubah",
      nada: ke === "Ditolak" ? "bahaya" : "simpan",
    });
    if (!lanjut) return;
    await jalankan(() => setQuotationStatus(id, ke));
  }

  async function hapus() {
    if (loading) return;
    const lanjut = await konfirmasi.minta({
      judul: "Hapus quotation ini?",
      pesan: "Dokumen dan seluruh barisnya dihapus permanen. Nomornya tidak dipakai ulang.",
      ringkasan,
      tombol: "Ya, Hapus",
      nada: "bahaya",
    });
    if (!lanjut) return;
    await jalankan(
      () => deleteQuotation(id),
      () => {
        router.push("/quotations");
        router.refresh();
      }
    );
  }

  async function terbitkan() {
    if (loading) return;
    if (!tanggal) {
      setPanelError("Tanggal Proforma wajib diisi");
      return;
    }
    setLoading(true);
    setPanelError("");
    try {
      const res = await issueProformaFromQuotation(
        id,
        tanggal,
        top === "" ? null : Math.max(0, Math.round(Number(top) || 0)),
        catatan.trim() || null
      );
      if (res.ok) {
        router.push(`/print/invoice/${res.id}`);
        router.refresh();
        return;
      }
      setPanelError(res.error);
    } catch {
      setPanelError(
        "Gagal, koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang lalu coba lagi."
      );
    }
    setLoading(false);
  }

  const topAngka = top === "" ? null : Math.max(0, Math.round(Number(top) || 0));
  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12px] font-medium text-muted mb-1.5";

  return (
    <div className="flex flex-col items-start sm:items-end gap-1.5">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {!sudahProforma && status !== "Ditolak" && (
          <button
            type="button"
            onClick={() => {
              setPanelError("");
              setPanel(true);
            }}
            disabled={loading}
            className={`${tombolCls} bg-botanical-700 text-white hover:bg-botanical-800 shadow-sm`}
          >
            <FileText size={15} /> Terbitkan Proforma
          </button>
        )}

        {!sudahProforma && status === "Draft" && (
          <button
            type="button"
            onClick={() =>
              gantiStatus(
                "Terkirim",
                "Tandai quotation ini sudah dikirim ke client?",
                "Isinya masih bisa disunting selama belum diputuskan."
              )
            }
            disabled={loading}
            className={tombolGaris}
          >
            <Send size={15} /> Tandai Terkirim
          </button>
        )}

        {!sudahProforma && (status === "Draft" || status === "Terkirim") && (
          <>
            <button
              type="button"
              onClick={() =>
                gantiStatus(
                  "Diterima",
                  "Tandai quotation ini diterima client?",
                  "Isinya dikunci. Proforma bisa diterbitkan sekarang atau nanti."
                )
              }
              disabled={loading}
              className={tombolGaris}
            >
              <ThumbsUp size={15} /> Diterima
            </button>
            <button
              type="button"
              onClick={() =>
                gantiStatus(
                  "Ditolak",
                  "Tandai quotation ini ditolak client?",
                  "Isinya dikunci dan Proforma tidak bisa diterbitkan. Statusnya bisa dikembalikan kalau client berubah pikiran."
                )
              }
              disabled={loading}
              className={`${tombolCls} border border-clay-500/40 text-clay-600 hover:bg-clay-100/60`}
            >
              <ThumbsDown size={15} /> Ditolak
            </button>
          </>
        )}

        {!sudahProforma && (status === "Diterima" || status === "Ditolak") && (
          <button
            type="button"
            onClick={() =>
              gantiStatus(
                "Terkirim",
                "Kembalikan status ke Terkirim?",
                "Quotation bisa disunting lagi."
              )
            }
            disabled={loading}
            className={tombolGaris}
          >
            <Undo2 size={15} /> Kembalikan ke Terkirim
          </button>
        )}

        {!sudahProforma && (
          <button
            type="button"
            onClick={hapus}
            disabled={loading}
            className={`${tombolCls} text-clay-600 hover:bg-clay-100/60`}
          >
            <Trash2 size={15} /> Hapus
          </button>
        )}
      </div>
      {error && <p className="text-clay-600 text-[12px]">{error}</p>}
      {konfirmasi.dialog}

      {panel &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            onClick={() => !loading && setPanel(false)}
            onKeyDown={(e) => e.key === "Escape" && !loading && setPanel(false)}
          >
            <div className="absolute inset-0 bg-botanical-900/50 backdrop-blur-[2px]" />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="judul-proforma"
              className="relative bg-[#FAF7F1] rounded-2xl shadow-2xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-line">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg p-2 bg-botanical-100 text-botanical-700">
                    <FileText size={18} />
                  </div>
                  <h3
                    id="judul-proforma"
                    className="font-display text-[16px] font-semibold text-ink"
                  >
                    Terbitkan Proforma
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPanel(false)}
                  disabled={loading}
                  className="text-muted hover:text-ink p-1 -mr-1"
                  aria-label="Tutup"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-4 flex flex-col gap-3">
                <p className="text-[12.5px] text-ink/75 leading-relaxed">
                  Baris, diskon, dan pajak {noQuotation} disalin apa adanya jadi
                  Proforma bertagihan <b>{formatRupiah(total)}</b> untuk{" "}
                  <b>{kepada}</b>. Tidak ada stok yang terpotong. Sesudah
                  terbit, quotation ini dikunci dan ditandai Diterima.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Tanggal Proforma</label>
                    <input
                      type="date"
                      value={tanggal}
                      onChange={(e) => setTanggal(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>TOP (hari)</label>
                    <NumberInput
                      bulat
                      value={top}
                      onChange={setTop}
                      placeholder="0 = tunai"
                      className={inputCls}
                    />
                  </div>
                </div>
                {topAngka != null && tanggal && (
                  <p className="text-[11.5px] text-muted -mt-1">
                    Jatuh tempo {addDaysStr(tanggal, topAngka)}
                  </p>
                )}
                <div>
                  <label className={labelCls}>
                    Cust. PO <span className="font-normal text-muted/70">(opsional)</span>
                  </label>
                  <input
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder="Nomor PO dari client"
                    className={inputCls}
                  />
                </div>
                {panelError && <p className="text-clay-600 text-[12px]">{panelError}</p>}
              </div>

              <div className="flex items-center gap-2 px-5 pb-5">
                <button
                  type="button"
                  onClick={terbitkan}
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium py-2.5 rounded-lg hover:bg-botanical-800 transition-colors disabled:opacity-60"
                >
                  <FileText size={15} />
                  {loading ? "Menerbitkan..." : "Ya, Terbitkan & Cetak"}
                </button>
                <button
                  type="button"
                  onClick={() => setPanel(false)}
                  disabled={loading}
                  className="px-4 py-2.5 rounded-lg border border-line text-[13px] font-medium text-muted hover:bg-white/60 transition-colors"
                >
                  Batal
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
