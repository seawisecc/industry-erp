"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send } from "lucide-react";
import { approvePO, markPOSent, setPOTop } from "./actions";

const TOP_PRESETS = [
  { label: "Tunai / CIA", days: 0 },
  { label: "7 hr", days: 7 },
  { label: "14 hr", days: 14 },
  { label: "30 hr", days: 30 },
];

export default function POStatusActions({
  poId,
  status,
  canApprove,
  topDays,
}: {
  poId: string;
  status: string;
  canApprove: boolean;
  topDays: number | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [topInput, setTopInput] = useState(topDays == null ? "" : String(topDays));
  const [topSaved, setTopSaved] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    if (loading) return;
    setLoading(true);
    setError("");
    const result = await fn();
    if (result.ok) {
      router.refresh();
    } else {
      setError(result.error || "Gagal");
    }
    setLoading(false);
  }

  async function saveTop(days: number) {
    if (loading) return;
    setLoading(true);
    setError("");
    setTopSaved(false);
    const result = await setPOTop(poId, days);
    if (result.ok) {
      setTopInput(String(days));
      setTopSaved(true);
      router.refresh();
    } else {
      setError(result.error || "Gagal");
    }
    setLoading(false);
  }

  return (
    <div className="glass rounded-2xl p-5 mb-5 flex flex-col gap-4">
      {/* ===== Aksi status ===== */}
      {status === "Dibuat" && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[13.5px] font-semibold text-ink">
              Menunggu Persetujuan
            </div>
            <p className="text-muted text-[12.5px]">
              PO harus disetujui dulu sebelum bisa dikirim ke supplier.
            </p>
          </div>
          {canApprove ? (
            <button
              onClick={() => run(() => approvePO(poId))}
              disabled={loading}
              className="flex items-center gap-2 bg-botanical-700 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg hover:bg-botanical-800 transition-colors disabled:opacity-60"
            >
              <CheckCircle2 size={15} /> {loading ? "Memproses..." : "Setujui PO"}
            </button>
          ) : (
            <span className="text-[12.5px] text-muted italic">
              Kamu tidak punya izin menyetujui PO
            </span>
          )}
        </div>
      )}

      {status === "Disetujui" && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[13.5px] font-semibold text-ink">
              Disetujui — siap dikirim
            </div>
            <p className="text-muted text-[12.5px]">
              Cetak PO, kirim ke supplier, lalu tandai sebagai terkirim.
            </p>
          </div>
          <button
            onClick={() => run(() => markPOSent(poId))}
            disabled={loading}
            className="flex items-center gap-2 bg-botanical-700 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg hover:bg-botanical-800 transition-colors disabled:opacity-60"
          >
            <Send size={15} /> {loading ? "Memproses..." : "Tandai Dikirim"}
          </button>
        </div>
      )}

      {/* ===== Term of Payment (setelah disetujui) ===== */}
      {status !== "Dibuat" && (
        <div className="flex items-center justify-between gap-3 flex-wrap border-t border-line pt-4 first:border-0 first:pt-0">
          <div>
            <div className="text-[13.5px] font-semibold text-ink">
              Term of Payment
              {topDays != null && (
                <span className="ml-2 text-[11.5px] bg-botanical-100 text-botanical-700 px-2 py-0.5 rounded-full">
                  {topDays === 0 ? "Tunai / CIA" : `${topDays} hari`}
                </span>
              )}
            </div>
            <p className="text-muted text-[12.5px]">
              Diisi saat proforma invoice keluar — jadi dasar jatuh tempo di menu
              Pembayaran.
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {TOP_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => saveTop(p.days)}
                disabled={loading}
                className={`text-[12px] px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-60 ${
                  topDays === p.days
                    ? "bg-botanical-700 text-white"
                    : "bg-botanical-100 text-botanical-700 hover:bg-botanical-700 hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
            <input
              type="number"
              min={0}
              max={365}
              value={topInput}
              onChange={(e) => setTopInput(e.target.value)}
              placeholder="hari"
              className="w-[70px] glass-input rounded-lg px-2 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
            />
            <button
              onClick={() => saveTop(parseInt(topInput) || 0)}
              disabled={loading || topInput === ""}
              className="text-[12px] px-2.5 py-1.5 rounded-lg border border-line hover:bg-white/60 transition-colors disabled:opacity-50"
            >
              Simpan
            </button>
          </div>
        </div>
      )}

      {topSaved && (
        <p className="text-botanical-700 text-[12px] font-medium">✓ TOP tersimpan</p>
      )}
      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
    </div>
  );
}
