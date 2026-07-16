"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskRound, Trash2 } from "lucide-react";
import { retestBatch, destroyBatch } from "./actions";

export default function ExpiryActions({
  batchId,
  itemNama,
  qtySisa,
  satuan,
}: {
  batchId: string;
  itemNama: string;
  qtySisa: number;
  satuan: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"retest" | "musnah" | null>(null);
  const [expBaru, setExpBaru] = useState("");
  const [catatan, setCatatan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (loading) return;
    setLoading(true);
    setError("");
    const result =
      mode === "retest"
        ? await retestBatch(batchId, expBaru, catatan)
        : await destroyBatch(batchId, catatan);
    if (result.ok) {
      setMode(null);
      setCatatan("");
      setExpBaru("");
      router.refresh();
    } else {
      setError(result.error || "Gagal");
    }
    setLoading(false);
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <>
      <div className="flex gap-1.5 justify-end">
        <button
          onClick={() => setMode("retest")}
          className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-lg bg-botanical-100 text-botanical-700 hover:bg-botanical-700 hover:text-white transition-colors"
        >
          <FlaskRound size={13} /> Re-test
        </button>
        <button
          onClick={() => setMode("musnah")}
          className="inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 rounded-lg text-clay-600 border border-clay-500/40 hover:bg-clay-100 transition-colors"
        >
          <Trash2 size={13} /> Musnahkan
        </button>
      </div>

      {mode && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setMode(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass bg-white/85 rounded-2xl p-5 w-[340px] text-left shadow-xl"
          >
            <div className="text-[14px] font-semibold text-ink mb-0.5">
              {mode === "retest" ? "Re-test Batch" : "Musnahkan Batch"}
            </div>
            <p className="text-[12px] text-muted mb-3">
              {itemNama} — sisa {qtySisa.toLocaleString("id-ID")} {satuan}
            </p>

            {mode === "retest" && (
              <div className="mb-2.5">
                <label className="block text-[11.5px] text-muted mb-1">
                  Exp Date Baru (sesuai re-test letter)
                </label>
                <input
                  type="date"
                  value={expBaru}
                  onChange={(e) => setExpBaru(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}

            <div className="mb-3">
              <label className="block text-[11.5px] text-muted mb-1">
                {mode === "retest"
                  ? "No. Re-test Letter / Catatan"
                  : "Alasan Pemusnahan"}
              </label>
              <input
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder={
                  mode === "retest" ? "RTL-2026-001" : "Expired, gagal QC, dst."
                }
                className={inputCls}
              />
            </div>

            {mode === "musnah" && (
              <p className="text-[11.5px] text-clay-600 mb-3">
                Seluruh sisa batch ({qtySisa.toLocaleString("id-ID")} {satuan}) akan
                dihapus dari stok. Tercatat di audit log.
              </p>
            )}

            {error && <p className="text-clay-600 text-[12px] mb-2">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={loading}
                className={`flex-1 rounded-lg py-2 text-[12.5px] font-medium text-white transition-colors disabled:opacity-60 ${
                  mode === "retest"
                    ? "bg-botanical-700 hover:bg-botanical-800"
                    : "bg-clay-600 hover:bg-clay-500"
                }`}
              >
                {loading
                  ? "Memproses..."
                  : mode === "retest"
                    ? "Perpanjang Exp"
                    : "Musnahkan"}
              </button>
              <button
                onClick={() => setMode(null)}
                className="px-3 py-2 rounded-lg text-[12.5px] text-muted hover:text-ink"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
