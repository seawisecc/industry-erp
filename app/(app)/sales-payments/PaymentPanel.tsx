"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Banknote, Trash2, X } from "lucide-react";
import { recordSalesPayment, deleteSalesPayment } from "./actions";

export type PaymentRow = {
  id: string;
  tanggal: string;
  jumlah: number;
  catatan: string | null;
};

function rupiah(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}
function tgl(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function PaymentPanel({
  invoiceId,
  noInvoice,
  client,
  total,
  payments,
}: {
  invoiceId: string;
  noInvoice: string | null;
  client: string;
  total: number;
  payments: PaymentRow[];
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [jumlah, setJumlah] = useState("");

  useEffect(() => setMounted(true), []);
  const [tanggal, setTanggal] = useState(new Date().toLocaleDateString("sv-SE"));
  const [catatan, setCatatan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const dibayar = payments.reduce((s, p) => s + Number(p.jumlah), 0);
  const sisa = Math.max(0, total - dibayar);

  async function submit(penuh: boolean) {
    if (loading) return;
    const nilai = penuh
      ? sisa
      : Math.round(Number(jumlah.replace(/[^\d]/g, "")));
    if (!(nilai > 0)) {
      setError("Isi jumlah pembayaran dulu");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await recordSalesPayment(invoiceId, nilai, tanggal, catatan || null);
      if (res.ok) {
        setJumlah("");
        setCatatan("");
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error || "Gagal mencatat pembayaran");
      }
    } catch {
      setError("Gagal — koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  async function hapus(id: string) {
    if (!confirm("Hapus catatan pembayaran ini?")) return;
    try {
      const res = await deleteSalesPayment(id);
      if (!res.ok) alert(res.error || "Gagal");
      router.refresh();
    } catch {
      alert("Gagal — muat ulang halaman lalu coba lagi.");
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 bg-botanical-700 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg hover:bg-botanical-800 transition-colors"
      >
        <Banknote size={14} /> Catat Pembayaran
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          onClick={() => !loading && setOpen(false)}
        >
          <div className="absolute inset-0 bg-botanical-900/50 backdrop-blur-[2px]" />
          <div
            className="relative bg-[#FAF7F1] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-line">
              <div className="min-w-0">
                <h3 className="font-display text-[16px] font-semibold text-ink">
                  Catat Pembayaran
                </h3>
                <p className="text-[12px] text-muted mt-0.5 truncate">
                  {noInvoice} · {client}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink p-1 -mr-1 flex-shrink-0"
                aria-label="Tutup"
              >
                <X size={18} />
              </button>
            </div>

            {/* Ringkasan tagihan */}
            <div className="grid grid-cols-3 gap-2 px-5 py-4">
              {[
                { label: "Total", value: rupiah(total), tone: "text-ink" },
                { label: "Dibayar", value: rupiah(dibayar), tone: "text-botanical-700" },
                { label: "Sisa", value: rupiah(sisa), tone: "text-clay-600" },
              ].map((s) => (
                <div key={s.label} className="bg-white/60 rounded-xl px-3 py-2.5 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-muted">
                    {s.label}
                  </div>
                  <div className={`text-[13.5px] font-semibold mt-0.5 ${s.tone}`}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Riwayat cicilan */}
            {payments.length > 0 && (
              <div className="px-5 pb-3">
                <div className="text-[11px] uppercase tracking-wide text-muted mb-1.5">
                  Riwayat Pembayaran
                </div>
                <div className="flex flex-col gap-1.5">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 text-[12.5px] bg-white/60 rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{rupiah(p.jumlah)}</span>
                        <span className="text-muted"> · {tgl(p.tanggal)}</span>
                        {p.catatan && (
                          <span className="block text-[11px] text-muted truncate">
                            {p.catatan}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => hapus(p.id)}
                        className="text-muted hover:text-clay-600 flex-shrink-0"
                        aria-label="Hapus"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Form input */}
            {sisa > 0 ? (
              <div className="px-5 pb-5 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-muted mb-1.5">
                      Jumlah Bayar
                    </label>
                    <input
                      inputMode="numeric"
                      value={jumlah}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^\d]/g, "");
                        setJumlah(digits ? Number(digits).toLocaleString("id-ID") : "");
                      }}
                      placeholder={sisa.toLocaleString("id-ID")}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-muted mb-1.5">
                      Tanggal
                    </label>
                    <input
                      type="date"
                      value={tanggal}
                      onChange={(e) => setTanggal(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-[12px] font-medium text-muted mb-1.5">
                    Catatan <span className="font-normal text-muted/70">(opsional)</span>
                  </label>
                  <input
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder="mis. transfer BCA, DP tahap 1"
                    className={inputCls}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setJumlah(sisa.toLocaleString("id-ID"))}
                  className="mt-2 text-botanical-700 text-[12px] font-medium hover:underline"
                >
                  Isi penuh (lunasi {rupiah(sisa)})
                </button>

                {error && <p className="text-clay-600 text-[12px] mt-2">{error}</p>}

                <div className="flex items-center gap-2 mt-4">
                  <button
                    onClick={() => submit(false)}
                    disabled={loading}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-botanical-700 text-white text-[13px] font-medium py-2.5 rounded-lg hover:bg-botanical-800 transition-colors disabled:opacity-60"
                  >
                    <Banknote size={15} />
                    {loading ? "Menyimpan..." : "Catat Pembayaran"}
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    disabled={loading}
                    className="px-4 py-2.5 rounded-lg border border-line text-[13px] font-medium text-muted hover:bg-white/60 transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-5 pb-5">
                <p className="text-botanical-700 text-[13px] font-medium bg-botanical-100/60 rounded-lg px-4 py-3">
                  ✓ Sudah lunas — dokumen otomatis menjadi Invoice.
                </p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
