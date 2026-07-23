"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { createItemsFromMaterials } from "../actions";

export type MaterialRow = {
  id: string;
  material_code: string;
  tradename: string;
  kategori: "Bahan Baku" | "Kemasan";
  supplier_nama: string | null;
};

type RowState = {
  checked: boolean;
  satuan: string;
  stokMin: string;
};

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

export default function FromMaterialForm({ materials }: { materials: MaterialRow[] }) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      materials.map((m) => [
        m.id,
        {
          checked: false,
          satuan: m.kategori === "Kemasan" ? "pcs" : "kg",
          stokMin: "",
        },
      ])
    )
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    if (!query) return materials;
    const q = query.toLowerCase();
    return materials.filter(
      (m) =>
        m.tradename.toLowerCase().includes(q) ||
        m.material_code.toLowerCase().includes(q) ||
        (m.supplier_nama || "").toLowerCase().includes(q)
    );
  }, [materials, query]);

  const checkedCount = materials.filter((m) => rows[m.id]?.checked).length;
  const allFilteredChecked =
    filtered.length > 0 && filtered.every((m) => rows[m.id]?.checked);

  function update(id: string, patch: Partial<RowState>) {
    setRows((rs) => ({ ...rs, [id]: { ...rs[id], ...patch } }));
  }

  function toggleAllFiltered() {
    const next = !allFilteredChecked;
    setRows((rs) => {
      const copy = { ...rs };
      for (const m of filtered) copy[m.id] = { ...copy[m.id], checked: next };
      return copy;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || checkedCount === 0) return;
    setLoading(true);
    setError("");
    try {
      const result = await createItemsFromMaterials(
        materials
          .filter((m) => rows[m.id]?.checked)
          .map((m) => ({
            material_id: m.id,
            satuan: rows[m.id].satuan,
            stok_minimum: parseNum(rows[m.id].stokMin),
          }))
      );
      if (result.ok) {
        router.push("/items");
        router.refresh();
      } else {
        setError(result.error || "Gagal membuat item");
        setLoading(false);
      }
    } catch {
      setError(
        "Gagal menyimpan — koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-2.5 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="glass rounded-2xl p-5 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <p className="text-muted text-[12.5px]">
            Centang material yang stoknya mau dilacak di gudang — item dibuat
            otomatis dengan nama tradename &amp; langsung ter-link.
          </p>
          <div className="relative sm:w-[240px] flex-shrink-0">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kode / tradename..."
              className={`${inputCls} pl-9`}
            />
          </div>
        </div>

        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allFilteredChecked}
                    onChange={toggleAllFiltered}
                    className="accent-[#2f4f3e]"
                  />
                </th>
                <th className="px-2 py-2 font-semibold">Material</th>
                <th className="px-2 py-2 font-semibold">Kategori</th>
                <th className="px-2 py-2 font-semibold">Supplier</th>
                <th className="px-2 py-2 font-semibold w-[100px]">Satuan</th>
                <th className="px-2 py-2 font-semibold w-[110px]">Stok Min</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-muted py-8 text-sm">
                    {materials.length === 0
                      ? "Semua material sudah punya item stok 🎉"
                      : "Tidak ada material yang cocok dengan pencarian."}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const row = rows[m.id];
                  return (
                    <tr
                      key={m.id}
                      className={`border-b border-line last:border-0 transition-colors cursor-pointer ${
                        row?.checked ? "bg-botanical-100/40" : "hover:bg-white/40"
                      }`}
                      onClick={() => update(m.id, { checked: !row?.checked })}
                    >
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={row?.checked || false}
                          onChange={(e) => update(m.id, { checked: e.target.checked })}
                          className="accent-[#2f4f3e]"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="font-medium max-w-[220px] truncate" title={m.tradename}>
                          {m.tradename}
                        </div>
                        <div className="text-[11px] text-muted font-mono">
                          {m.material_code}
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            m.kategori === "Kemasan"
                              ? "bg-amber-100 text-amber-500"
                              : "bg-botanical-100 text-botanical-700"
                          }`}
                        >
                          {m.kategori}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <div
                          className="max-w-[160px] truncate text-[12.5px]"
                          title={m.supplier_nama || undefined}
                        >
                          {m.supplier_nama || "-"}
                        </div>
                      </td>
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          value={row?.satuan || ""}
                          onChange={(e) => update(m.id, { satuan: e.target.value })}
                          disabled={!row?.checked}
                          className={`${inputCls} disabled:opacity-40`}
                        />
                      </td>
                      <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row?.stokMin || ""}
                          onChange={(e) => update(m.id, { stokMin: e.target.value })}
                          disabled={!row?.checked}
                          placeholder="0"
                          className={`${inputCls} disabled:opacity-40`}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || checkedCount === 0}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading
          ? "Membuat item..."
          : checkedCount === 0
            ? "Pilih material dulu"
            : `Buat ${checkedCount} Item Stok`}
      </button>
    </form>
  );
}
