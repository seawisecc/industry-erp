"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createMaterial, updateMaterial, type InciRow } from "./actions";

type SupplierOption = { id: string; nama: string };
type InciOption = { id: string; inci_name: string; cas_number: string | null };

type Props = {
  suppliers: SupplierOption[];
  inciOptions: InciOption[];
  /** kalau diisi, form jadi mode Edit */
  material?: {
    id: string;
    material_code: string;
    tradename: string;
    supplier_id: string | null;
    origin: string | null;
    noc: string | null;
    inci_rows: InciRow[];
  };
};

export default function MaterialForm({ suppliers, inciOptions, material }: Props) {
  const router = useRouter();
  const isEdit = !!material;

  const [materialCode, setMaterialCode] = useState(material?.material_code || "");
  const [tradename, setTradename] = useState(material?.tradename || "");
  const [supplierId, setSupplierId] = useState(material?.supplier_id || "");
  const [origin, setOrigin] = useState(material?.origin || "");
  const [noc, setNoc] = useState(material?.noc || "");
  type RowState = { inci_master_id: string; inci_name: string; percentage: string };
  const [rows, setRows] = useState<RowState[]>(
    material?.inci_rows?.length
      ? material.inci_rows.map((r) => ({ ...r, percentage: String(r.percentage) }))
      : [{ inci_master_id: "", inci_name: "", percentage: "" }]
  );
  const [activeSearch, setActiveSearch] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalPct = rows.reduce((s, r) => s + (parseFloat(r.percentage.replace(",", ".")) || 0), 0);
  const pctWarning = Math.abs(totalPct - 100) > 0.01 && rows.some((r) => r.inci_name);

  function updateRow(index: number, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { inci_master_id: "", inci_name: "", percentage: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = {
        material_code: materialCode,
        tradename,
        supplier_id: supplierId || null,
        origin: origin || null,
        noc: noc || null,
        inci_rows: rows.map((r) => ({
          inci_master_id: r.inci_master_id,
          inci_name: r.inci_name,
          percentage: parseFloat(r.percentage.replace(",", ".")) || 0,
        })),
      };
      if (isEdit && material) {
        await updateMaterial(material.id, payload);
      } else {
        await createMaterial(payload);
      }
      router.push("/materials");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan material");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Kode Material</label>
          <input
            value={materialCode}
            onChange={(e) => setMaterialCode(e.target.value)}
            required
            placeholder="RM001-Sd.ME"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Tradename</label>
          <input
            value={tradename}
            onChange={(e) => setTradename(e.target.value)}
            required
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
      </div>

      <div>
        <label className="block text-[12.5px] font-medium text-muted mb-1.5">Supplier</label>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
        >
          <option value="">- Pilih Supplier -</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.nama}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[12.5px] font-medium text-muted">INCI Name & Komposisi (%)</label>
          <span className={`text-[12px] font-medium ${pctWarning ? "text-clay-600" : "text-botanical-700"}`}>
            Total: {totalPct.toFixed(2)}%{pctWarning ? " (idealnya 100%)" : ""}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const query = row.inci_name.toLowerCase();
            const filtered =
              activeSearch === i && query && !row.inci_master_id
                ? inciOptions.filter((o) => o.inci_name.toLowerCase().includes(query)).slice(0, 8)
                : [];
            return (
              <div key={i} className="relative flex items-start gap-2">
                <div className="flex-1 relative">
                  <input
                    value={row.inci_name}
                    onChange={(e) => {
                      updateRow(i, { inci_name: e.target.value, inci_master_id: "" });
                      setActiveSearch(i);
                    }}
                    onFocus={() => setActiveSearch(i)}
                    onBlur={() => setTimeout(() => setActiveSearch(null), 150)}
                    placeholder="Ketik untuk cari INCI Name..."
                    className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                  {filtered.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 glass rounded-lg overflow-hidden z-20 max-h-52 overflow-y-auto">
                      {filtered.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            updateRow(i, { inci_master_id: o.id, inci_name: o.inci_name });
                            setActiveSearch(null);
                          }}
                          className="w-full text-left px-3 py-2 text-[13px] hover:bg-white/60 flex justify-between gap-2"
                        >
                          <span>{o.inci_name}</span>
                          <span className="text-muted text-[11.5px]">{o.cas_number || ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.percentage}
                  onChange={(e) => updateRow(i, { percentage: e.target.value })}
                  placeholder="%"
                  className="w-24 glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="p-2.5 text-muted hover:text-clay-600 transition-colors"
                  title="Hapus baris"
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-botanical-700 hover:underline"
        >
          <Plus size={14} /> Tambah Komponen INCI
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">Origin</label>
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="Indonesia / China / dst"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">NOC (Natural Origin Content)</label>
          <input
            value={noc}
            onChange={(e) => setNoc(e.target.value)}
            placeholder="Misal: 98%"
            className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
          />
        </div>
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm mt-2 disabled:opacity-60"
      >
        {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan"}
      </button>
    </form>
  );
}