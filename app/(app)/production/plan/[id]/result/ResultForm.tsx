"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishProduction } from "../../../actions";

export type ResultVariant = {
  nama_varian: string;
  teoritis_pcs: number;
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

export default function ResultForm({
  planId,
  variants,
}: {
  planId: string;
  variants: ResultVariant[];
}) {
  const router = useRouter();
  const [real, setReal] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      variants.map((v) => [
        v.nama_varian,
        v.teoritis_pcs > 0 ? String(v.teoritis_pcs) : "",
      ])
    )
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalTeoritis = variants.reduce((s, v) => s + v.teoritis_pcs, 0);
  const totalReal = variants.reduce(
    (s, v) => s + parseNum(real[v.nama_varian] || ""),
    0
  );
  const yieldPct = totalTeoritis > 0 ? (totalReal / totalTeoritis) * 100 : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (
      !confirm(
        "Simpan hasil produksi? Stok bahan & kemasan akan terpotong sesuai data eksekusi (tidak bisa dibatalkan)."
      )
    )
      return;
    setLoading(true);
    setError("");
    const result = await finishProduction(
      planId,
      variants.map((v) => ({
        varian_ukuran: v.nama_varian,
        qty_hasil: parseNum(real[v.nama_varian] || ""),
      }))
    );
    if (result.ok && result.batchId) {
      router.push(`/production/${result.batchId}`);
      router.refresh();
    } else {
      setError(result.error || "Gagal menyimpan hasil");
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Hasil Produk Jadi
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Teoritis = rencana kemas dari tahap eksekusi. Isi jumlah real yang
            benar-benar jadi.
          </p>
        </div>

        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full min-w-[480px] text-[13px]">
            <thead>
              <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
                <th className="px-2 py-2 font-semibold">Varian</th>
                <th className="px-2 py-2 font-semibold text-right">Teoritis (pcs)</th>
                <th className="px-2 py-2 font-semibold w-[150px]">Real (pcs)</th>
                <th className="px-2 py-2 font-semibold text-right">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => {
                const realVal = parseNum(real[v.nama_varian] || "");
                const diff = realVal - v.teoritis_pcs;
                return (
                  <tr key={v.nama_varian} className="border-b border-line last:border-0">
                    <td className="px-2 py-2.5 font-medium">{v.nama_varian}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-[12px]">
                      {v.teoritis_pcs.toLocaleString("id-ID")}
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={real[v.nama_varian] || ""}
                        onChange={(e) =>
                          setReal((s) => ({ ...s, [v.nama_varian]: e.target.value }))
                        }
                        className={inputCls}
                      />
                    </td>
                    <td
                      className={`px-2 py-2.5 text-right font-mono text-[12px] ${
                        diff === 0
                          ? "text-muted"
                          : diff < 0
                            ? "text-clay-600"
                            : "text-botanical-700"
                      }`}
                    >
                      {diff === 0 ? "—" : `${diff > 0 ? "+" : ""}${diff.toLocaleString("id-ID")}`}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-white/50 font-semibold">
                <td className="px-2 py-2.5">Total</td>
                <td className="px-2 py-2.5 text-right font-mono text-[12px]">
                  {totalTeoritis.toLocaleString("id-ID")}
                </td>
                <td className="px-2 py-2.5 font-mono text-[12px]">
                  {totalReal.toLocaleString("id-ID")}
                </td>
                <td
                  className={`px-2 py-2.5 text-right text-[12px] ${
                    yieldPct >= 95 ? "text-botanical-700" : "text-clay-600"
                  }`}
                >
                  yield {yieldPct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || totalReal <= 0}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading
          ? "Memotong stok & menghitung HPP..."
          : "Simpan Hasil & Potong Stok"}
      </button>
      <p className="text-muted text-[12px] text-center -mt-3">
        Stok terpotong FEFO sesuai timbangan real + kemasan + adjusting. HPP real
        tercatat di Production History.
      </p>
    </form>
  );
}
