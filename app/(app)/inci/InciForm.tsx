"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveInci, type InciInput } from "./actions";

export default function InciForm({
  id,
  initial,
}: {
  id?: string;
  initial?: Partial<InciInput>;
}) {
  const router = useRouter();
  const [inciName, setInciName] = useState(initial?.inci_name || "");
  const [casNumber, setCasNumber] = useState(initial?.cas_number || "");
  const [noael, setNoael] = useState(initial?.noael || "");
  const [fungsi, setFungsi] = useState(initial?.function || "");
  const [reference, setReference] = useState(initial?.reference || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // guard: cegah double-submit
    setLoading(true);
    setError("");
    const result = await saveInci(
      {
        inci_name: inciName,
        cas_number: casNumber || null,
        noael: noael || null,
        function: fungsi || null,
        reference: reference || null,
      },
      id
    );
    if (result.ok) {
      router.push("/inci");
      router.refresh();
    } else {
      setError(result.error || "Gagal menyimpan");
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <label className={labelCls}>INCI Name</label>
        <input
          value={inciName}
          onChange={(e) => setInciName(e.target.value)}
          required
          placeholder="Misal: Aqua / Glycerin"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>CAS Number</label>
          <input
            value={casNumber}
            onChange={(e) => setCasNumber(e.target.value)}
            placeholder="7732-18-5"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>NOAEL (mg/kg/d)</label>
          <input
            value={noael}
            onChange={(e) => setNoael(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Function</label>
        <input
          value={fungsi}
          onChange={(e) => setFungsi(e.target.value)}
          placeholder="Solvent / Humectant / dst"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Reference</label>
        <textarea
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          rows={2}
          placeholder="Sumber rujukan (CIR, SCCS, dst)"
          className={inputCls}
        />
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Menyimpan..." : id ? "Simpan Perubahan" : "Simpan"}
      </button>
    </form>
  );
}
