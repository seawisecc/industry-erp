"use client";

import { useState } from "react";
import { Sparkles, Copy, Check } from "lucide-react";

export type InciEntry = { name: string; pct: number };

export default function InciPanel({
  entries,
  warnings,
}: {
  entries: InciEntry[];
  warnings: string[];
}) {
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  const declaration = entries.map((e) => e.name).join(", ");

  async function copyDeclaration() {
    await navigator.clipboard.writeText(declaration);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="glass rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            INCI Names (Ingredient List)
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Digabung dari komposisi INCI semua material di formula, komponen sama
            dijumlahkan, urut dari kandungan terbesar.
          </p>
        </div>
        {!generated && (
          <button
            onClick={() => setGenerated(true)}
            disabled={entries.length === 0}
            className="flex items-center gap-2 bg-botanical-700 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg hover:bg-botanical-800 transition-colors disabled:opacity-50"
          >
            <Sparkles size={15} /> Generate INCI Names
          </button>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="bg-amber-100 text-amber-500 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed">
          ⚠ Belum lengkap: {warnings.join("; ")}. Hasil generate mungkin belum
          mencerminkan formula penuh.
        </div>
      )}

      {entries.length === 0 && (
        <p className="text-muted text-[13px]">
          Tidak ada data INCI — pastikan item formula ter-link ke Material dan
          material punya komposisi INCI.
        </p>
      )}

      {generated && entries.length > 0 && (
        <>
          {/* Deklarasi ingredient (urut terbesar → terkecil) */}
          <div className="bg-white/60 border border-line rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wide text-muted font-semibold">
                Ingredients
              </span>
              <button
                onClick={copyDeclaration}
                className="flex items-center gap-1 text-[12px] text-botanical-700 font-medium hover:underline"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Tersalin" : "Salin"}
              </button>
            </div>
            <p className="text-[13px] leading-relaxed">{declaration}</p>
          </div>

          {/* Rincian persentase */}
          <div className="border border-line rounded-xl overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-b border-line bg-white/50">
                  <th className="px-3 py-2 font-semibold w-10">#</th>
                  <th className="px-3 py-2 font-semibold">INCI Name</th>
                  <th className="px-3 py-2 font-semibold text-right">% dalam Produk</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.name} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-muted">{i + 1}</td>
                    <td className="px-3 py-2">{e.name}</td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {e.pct.toLocaleString("id-ID", {
                        maximumFractionDigits: 4,
                      })}
                      %
                    </td>
                  </tr>
                ))}
                <tr className="bg-white/50 font-medium">
                  <td className="px-3 py-2" colSpan={2}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[12px]">
                    {entries
                      .reduce((s, e) => s + e.pct, 0)
                      .toLocaleString("id-ID", { maximumFractionDigits: 2 })}
                    %
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
