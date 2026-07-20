"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { saveExecution, ExecutionData } from "../../../actions";

export type ItemInfo = {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
};

export type PlanInfo = {
  id: string;
  no_batch: string;
  jumlah_batch: number;
  bulkKg: number;
  formulas: { item_id: string; percentage: number }[];
  variants: {
    nama_varian: string;
    netto: number | null;
    packaging: { item_id: string; qty_per_pcs: number }[];
  }[];
  saved: ExecutionData | null;
};

type AdjustRow = { item: ItemInfo | null; query: string; open: boolean; qty: string };

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}
function toStr(n: number) {
  return String(Math.round(n * 10000) / 10000).replace(".", ",");
}
function formatId(n: number) {
  return n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}

export default function ExecuteForm({
  plan,
  items,
}: {
  plan: PlanInfo;
  items: ItemInfo[];
}) {
  const router = useRouter();
  const itemOf = (id: string) => items.find((it) => it.id === id);

  // ===== Bahan (formula): teoritis fixed, real editable =====
  const [bahanReal, setBahanReal] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of plan.formulas) {
      const teoritis = (f.percentage / 100) * plan.bulkKg;
      const saved = plan.saved?.bahan?.find((b) => b.item_id === f.item_id);
      init[f.item_id] = saved ? toStr(saved.real) : toStr(teoritis);
    }
    return init;
  });

  // ===== Varian: rencana pcs =====
  const [variantPcs, setVariantPcs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of plan.variants) {
      const saved = plan.saved?.variants?.find((s) => s.nama_varian === v.nama_varian);
      init[v.nama_varian] = saved ? String(saved.rencana_pcs) : "";
    }
    return init;
  });

  // ===== Kemasan: real diambil (editable) =====
  const [kemasanQty, setKemasanQty] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of plan.saved?.kemasan || []) init[k.item_id] = toStr(k.qty);
    return init;
  });

  // ===== Adjusting =====
  const [adjustRows, setAdjustRows] = useState<AdjustRow[]>(() =>
    (plan.saved?.adjust || []).map((a) => ({
      item: itemOf(a.item_id) || null,
      query: "",
      open: false,
      qty: toStr(a.qty),
    }))
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Kebutuhan kemasan teoritis dari rencana pcs varian
  const kemasanTeoritis = new Map<string, number>();
  for (const v of plan.variants) {
    const pcs = parseNum(variantPcs[v.nama_varian] || "");
    if (pcs <= 0) continue;
    for (const p of v.packaging) {
      kemasanTeoritis.set(
        p.item_id,
        (kemasanTeoritis.get(p.item_id) || 0) + p.qty_per_pcs * pcs
      );
    }
  }
  const kemasanIds = Array.from(
    new Set([...kemasanTeoritis.keys(), ...Object.keys(kemasanQty)])
  );

  function updateAdjust(idx: number, patch: Partial<AdjustRow>) {
    setAdjustRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function adjustOptions(row: AdjustRow) {
    if (!row.open || !row.query) return [];
    const q = row.query.toLowerCase();
    const used = adjustRows.map((r) => r.item?.id).filter(Boolean);
    return items
      .filter((it) => !used.includes(it.id) || it.id === row.item?.id)
      .filter(
        (it) => it.nama.toLowerCase().includes(q) || it.kode.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");

    const data: ExecutionData = {
      bahan: plan.formulas.map((f) => ({
        item_id: f.item_id,
        teoritis: (f.percentage / 100) * plan.bulkKg,
        real: parseNum(bahanReal[f.item_id] || ""),
      })),
      variants: plan.variants.map((v) => ({
        nama_varian: v.nama_varian,
        rencana_pcs: parseNum(variantPcs[v.nama_varian] || ""),
      })),
      kemasan: kemasanIds
        .map((id) => ({
          item_id: id,
          qty:
            kemasanQty[id] !== undefined
              ? parseNum(kemasanQty[id])
              : kemasanTeoritis.get(id) || 0,
        }))
        .filter((k) => k.qty > 0),
      adjust: adjustRows
        .filter((r) => r.item && parseNum(r.qty) > 0)
        .map((r) => ({ item_id: r.item!.id, qty: parseNum(r.qty) })),
    };

    const result = await saveExecution(plan.id, data);
    if (result.ok) {
      router.push("/production");
      router.refresh();
    } else {
      setError(result.error || "Gagal menyimpan");
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* ===== BAHAN BAKU: teoritis vs real ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Penimbangan Bahan (Formula × {formatId(plan.bulkKg)} kg bulk)
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Kolom kiri = jumlah teoritis, kolom kanan = hasil timbang nyata di
            lapangan (boleh koma).
          </p>
        </div>

        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
                <th className="px-2 py-2 font-semibold">Bahan</th>
                <th className="px-2 py-2 font-semibold text-right">% Formula</th>
                <th className="px-2 py-2 font-semibold text-right">Teoritis</th>
                <th className="px-2 py-2 font-semibold w-[140px]">Timbang Real</th>
                <th className="px-2 py-2 font-semibold text-right">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {plan.formulas.map((f) => {
                const it = itemOf(f.item_id);
                const teoritis = (f.percentage / 100) * plan.bulkKg;
                const real = parseNum(bahanReal[f.item_id] || "");
                const diff = real - teoritis;
                const stokKurang = it && real > it.stok;
                return (
                  <tr key={f.item_id} className="border-b border-line last:border-0">
                    <td className="px-2 py-2.5">
                      <div className="font-medium">{it?.nama || "—"}</div>
                      <div className="text-[11px] text-muted font-mono">
                        {it?.kode} · stok {formatId(it?.stok || 0)} {it?.satuan}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap">
                      {f.percentage.toLocaleString("id-ID")}%
                    </td>
                    <td className="px-2 py-2.5 text-right whitespace-nowrap font-mono text-[12px]">
                      {formatId(teoritis)} {it?.satuan}
                    </td>
                    <td className="px-2 py-2.5">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={bahanReal[f.item_id] || ""}
                        onChange={(e) =>
                          setBahanReal((s) => ({ ...s, [f.item_id]: e.target.value }))
                        }
                        className={`${inputCls} ${stokKurang ? "ring-2 ring-clay-500" : ""}`}
                      />
                    </td>
                    <td
                      className={`px-2 py-2.5 text-right whitespace-nowrap font-mono text-[12px] ${
                        Math.abs(diff) < 0.0001
                          ? "text-muted"
                          : diff > 0
                            ? "text-clay-600"
                            : "text-botanical-700"
                      }`}
                    >
                      {Math.abs(diff) < 0.0001
                        ? "—"
                        : `${diff > 0 ? "+" : ""}${formatId(diff)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== ADJUSTING ===== */}
      <div className="relative z-20 glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold text-ink">
              Bahan Tambahan (Adjusting)
            </h2>
            <p className="text-muted text-[12.5px] mt-0.5">
              Penambahan di luar formula selama proses (pH adjuster, pewarna, dst).
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setAdjustRows((rs) => [
                ...rs,
                { item: null, query: "", open: false, qty: "" },
              ])
            }
            className="flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline flex-shrink-0"
          >
            <Plus size={14} /> Tambah Bahan
          </button>
        </div>

        {adjustRows.length === 0 && (
          <p className="text-muted text-[12.5px]">Tidak ada — opsional.</p>
        )}
        {adjustRows.map((row, idx) => {
          const options = adjustOptions(row);
          return (
            <div
              key={idx}
              className="grid grid-cols-1 sm:grid-cols-[1fr_140px_32px] gap-2 items-start"
            >
              <div className="relative">
                {row.item ? (
                  <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
                    <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                      {row.item.kode}
                    </span>
                    <span className="truncate flex-1">{row.item.nama}</span>
                    <span className="text-[11px] text-muted flex-shrink-0">
                      stok {formatId(row.item.stok)} {row.item.satuan}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateAdjust(idx, { item: null, query: "" })}
                      className="text-muted hover:text-clay-600 flex-shrink-0"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={row.query}
                      onChange={(e) =>
                        updateAdjust(idx, { query: e.target.value, open: true })
                      }
                      onFocus={() => updateAdjust(idx, { open: true })}
                      onBlur={() =>
                        setTimeout(() => updateAdjust(idx, { open: false }), 150)
                      }
                      placeholder="Ketik kode / nama bahan..."
                      className={inputCls}
                    />
                    {options.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-20 max-h-52 overflow-y-auto">
                        {options.map((it) => (
                          <button
                            key={it.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              updateAdjust(idx, { item: it, query: "", open: false });
                            }}
                            className="w-full text-left px-3 py-2 text-[13px] hover:bg-porcelain flex gap-2"
                          >
                            <span className="font-mono text-[11.5px] text-botanical-700 flex-shrink-0">
                              {it.kode}
                            </span>
                            <span className="truncate">{it.nama}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <input
                type="text"
                inputMode="decimal"
                value={row.qty}
                onChange={(e) => updateAdjust(idx, { qty: e.target.value })}
                placeholder={row.item ? `Qty (${row.item.satuan})` : "Qty"}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setAdjustRows((rs) => rs.filter((_, i) => i !== idx))}
                className="text-muted hover:text-clay-600 p-2"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ===== VARIAN & KEMASAN ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Rencana Kemas &amp; Pengambilan Kemasan
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Isi rencana pcs per ukuran — kebutuhan kemasan terhitung otomatis,
            jumlah ambil real bisa disesuaikan.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {plan.variants.map((v) => (
            <div key={v.nama_varian}>
              <label className="block text-[11.5px] text-muted mb-1">
                {v.nama_varian}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={variantPcs[v.nama_varian] || ""}
                onChange={(e) =>
                  setVariantPcs((s) => ({ ...s, [v.nama_varian]: e.target.value }))
                }
                placeholder="0 pcs"
                className={inputCls}
              />
            </div>
          ))}
        </div>

        {kemasanIds.length > 0 && (
          <div className="overflow-x-auto -mx-2 px-2 mt-1">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11.5px] uppercase tracking-wide border-b border-line">
                  <th className="px-2 py-2 font-semibold">Kemasan</th>
                  <th className="px-2 py-2 font-semibold text-right">Teoritis</th>
                  <th className="px-2 py-2 font-semibold w-[140px]">Ambil Real</th>
                </tr>
              </thead>
              <tbody>
                {kemasanIds.map((id) => {
                  const it = itemOf(id);
                  const teoritis = kemasanTeoritis.get(id) || 0;
                  const val =
                    kemasanQty[id] !== undefined
                      ? kemasanQty[id]
                      : teoritis > 0
                        ? toStr(teoritis)
                        : "";
                  return (
                    <tr key={id} className="border-b border-line last:border-0">
                      <td className="px-2 py-2.5">
                        <div className="font-medium">{it?.nama || "—"}</div>
                        <div className="text-[11px] text-muted font-mono">
                          {it?.kode} · stok {formatId(it?.stok || 0)} {it?.satuan}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right whitespace-nowrap font-mono text-[12px]">
                        {formatId(teoritis)} {it?.satuan}
                      </td>
                      <td className="px-2 py-2.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={val}
                          onChange={(e) =>
                            setKemasanQty((s) => ({ ...s, [id]: e.target.value }))
                          }
                          className={inputCls}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Menyimpan..." : "Simpan Data Eksekusi"}
      </button>
      <p className="text-muted text-[12px] text-center -mt-3">
        Stok belum terpotong di tahap ini — pemotongan terjadi saat Input Hasil
        (Result).
      </p>
    </form>
  );
}
