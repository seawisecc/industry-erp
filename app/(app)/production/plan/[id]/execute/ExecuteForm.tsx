"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import {
  saveExecution,
  ExecutionData,
  StepLog,
  IpcHasil,
} from "../../../actions";

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
  formulas: { item_id: string; percentage: number; fase: string | null }[];
  variants: {
    nama_varian: string;
    netto: number | null;
    packaging: { item_id: string; qty_per_pcs: number }[];
  }[];
  saved: ExecutionData | null;
  steps: {
    urutan: number;
    instruksi: string;
    suhu: string | null;
    rpm: string | null;
    durasi: string | null;
  }[];
  mesOn: boolean;
  qcOn: boolean;
  operator: string;
  produkKode: string | null;
  produkNama: string;
  brand: string | null;
  batchSizeKg: number;
  tanggalRencana: string;
  ipcParams: IpcHasil[];
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

  // ===== Hasil ruahan & rekonsiliasi kemasan (Catatan Pengemasan) =====
  const [bulkReal, setBulkReal] = useState(
    plan.saved?.bulk_real != null ? toStr(plan.saved.bulk_real) : ""
  );
  const [kemasanTerpakai, setKemasanTerpakai] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {};
      for (const k of plan.saved?.kemasan || [])
        if (k.terpakai != null) init[k.item_id] = toStr(k.terpakai);
      return init;
    }
  );
  const [kemasanRusak, setKemasanRusak] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of plan.saved?.kemasan || [])
      if (k.rusak != null) init[k.item_id] = toStr(k.rusak);
    return init;
  });

  // ===== IPC: hasil uji produk ruahan =====
  const [ipcRows, setIpcRows] = useState<IpcHasil[]>(() =>
    plan.ipcParams.map((p) => {
      const saved = plan.saved?.ipc?.find((x) => x.nama === p.nama);
      return { ...p, hasil: saved?.hasil || "" };
    })
  );

  // ===== MES: log langkah produksi =====
  const [stepLogs, setStepLogs] = useState<StepLog[]>(() =>
    plan.steps.map((s) => {
      const saved = plan.saved?.langkah?.find((l) => l.urutan === s.urutan);
      return (
        saved || {
          urutan: s.urutan,
          instruksi: s.instruksi,
          mulai: null,
          selesai: null,
          oleh: null,
          catatan: null,
        }
      );
    })
  );

  function updateStepLog(urutan: number, patch: Partial<StepLog>) {
    setStepLogs((ls) =>
      ls.map((l) => (l.urutan === urutan ? { ...l, ...patch } : l))
    );
  }

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
          terpakai: parseNum(kemasanTerpakai[id] || ""),
          rusak: parseNum(kemasanRusak[id] || ""),
        }))
        .filter((k) => k.qty > 0),
      ipc: plan.qcOn && ipcRows.length > 0 ? ipcRows : plan.saved?.ipc,
      bulk_real: bulkReal ? parseNum(bulkReal) : undefined,
      adjust: adjustRows
        .filter((r) => r.item && parseNum(r.qty) > 0)
        .map((r) => ({ item_id: r.item!.id, qty: parseNum(r.qty) })),
      langkah: plan.mesOn && stepLogs.length > 0 ? stepLogs : plan.saved?.langkah,
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
      {/* ============ TAHAP 1 — CATATAN PENGOLAHAN BATCH ============ */}
      <div className="flex items-center gap-3">
        <div className="bg-botanical-700 text-white rounded-lg px-3 py-1.5 text-[12px] font-semibold">
          TAHAP 1
        </div>
        <h2 className="font-display text-[17px] font-semibold text-ink">
          Catatan Pengolahan Batch
        </h2>
      </div>

      {/* ===== INFORMASI PRODUK ===== */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-[15px] font-semibold text-ink mb-3">
          Informasi Produk
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Produk
            </div>
            <div className="font-medium">{plan.produkNama}</div>
            <div className="text-[11.5px] text-muted font-mono">
              {[plan.produkKode, plan.brand].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              No. Batch
            </div>
            <div className="font-mono font-medium">{plan.no_batch}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Ukuran Batch
            </div>
            <div className="font-medium">
              {formatId(plan.jumlah_batch)} × {formatId(plan.batchSizeKg)} kg ={" "}
              {formatId(plan.bulkKg)} kg
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">
              Tanggal Produksi
            </div>
            <div className="font-medium">
              {new Date(plan.tanggalRencana + "T00:00:00").toLocaleDateString(
                "id-ID",
                { day: "numeric", month: "long", year: "numeric" }
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== FORMULASI & FASE ===== */}
      <div className="glass rounded-2xl overflow-hidden">
        <h3 className="font-display text-[15px] font-semibold text-ink px-6 pt-5 pb-3">
          Formulasi &amp; Fase
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-y border-line bg-white/40">
                <th className="px-4 py-2 font-semibold whitespace-nowrap">Fase</th>
                <th className="px-4 py-2 font-semibold whitespace-nowrap">Kode</th>
                <th className="px-4 py-2 font-semibold">Bahan</th>
                <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">%</th>
                <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">
                  Qty Batch
                </th>
              </tr>
            </thead>
            <tbody>
              {[...plan.formulas]
                .sort((a, b) =>
                  (a.fase || "zz").localeCompare(b.fase || "zz") ||
                  b.percentage - a.percentage
                )
                .map((f) => {
                  const it = itemOf(f.item_id);
                  return (
                    <tr key={f.item_id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 text-center font-semibold text-botanical-700">
                        {f.fase || "—"}
                      </td>
                      <td className="px-4 py-2 font-mono text-[11.5px] whitespace-nowrap">
                        {it?.kode}
                      </td>
                      <td className="px-4 py-2">{it?.nama || "—"}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {f.percentage.toLocaleString("id-ID")}%
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap font-mono text-[12px]">
                        {formatId((f.percentage / 100) * plan.bulkKg)} {it?.satuan}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== BAHAN BAKU: teoritis vs real ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Penimbangan Bahan
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

      {/* ===== MES: CHECKLIST LANGKAH PRODUKSI ===== */}
      {plan.mesOn && plan.steps.length > 0 && (
        <div className="glass rounded-2xl p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-display text-[15.5px] font-semibold text-ink">
                Langkah Produksi
                <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-botanical-100 text-botanical-700 align-middle">
                  MES
                </span>
              </h2>
              <p className="text-muted text-[12.5px] mt-0.5">
                Tap Mulai saat mengerjakan, Selesai saat rampung — waktu &amp;
                operator terekam otomatis ke Batch Record.
              </p>
            </div>
            <span className="text-[12px] text-muted">
              {stepLogs.filter((l) => l.selesai).length}/{stepLogs.length} selesai
            </span>
          </div>

          {plan.steps.map((s) => {
            const log = stepLogs.find((l) => l.urutan === s.urutan)!;
            const jam = (iso: string | null) =>
              iso
                ? new Date(iso).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : null;
            return (
              <div
                key={s.urutan}
                className={`border rounded-xl p-4 flex flex-col gap-2 transition-colors ${
                  log.selesai
                    ? "border-botanical-700/30 bg-botanical-100/30"
                    : log.mulai
                      ? "border-amber-500/40 bg-amber-100/20"
                      : "border-line"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="font-display text-[15px] font-semibold text-botanical-700 w-6 text-right flex-shrink-0">
                    {s.urutan}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium">{s.instruksi}</div>
                    {(s.suhu || s.rpm || s.durasi) && (
                      <div className="text-[12px] text-muted mt-0.5">
                        {[s.suhu, s.rpm ? `${s.rpm} rpm` : null, s.durasi]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                    {(log.mulai || log.selesai) && (
                      <div className="text-[11.5px] text-muted mt-1">
                        {log.mulai ? `Mulai ${jam(log.mulai)}` : ""}
                        {log.selesai ? ` — Selesai ${jam(log.selesai)}` : ""}
                        {log.oleh ? ` · ${log.oleh}` : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!log.mulai && (
                      <button
                        type="button"
                        onClick={() =>
                          updateStepLog(s.urutan, {
                            mulai: new Date().toISOString(),
                            oleh: plan.operator || null,
                          })
                        }
                        className="h-8 px-3 rounded-lg bg-botanical-700 text-white text-[12px] font-medium hover:bg-botanical-800 transition-colors"
                      >
                        Mulai
                      </button>
                    )}
                    {log.mulai && !log.selesai && (
                      <button
                        type="button"
                        onClick={() =>
                          updateStepLog(s.urutan, {
                            selesai: new Date().toISOString(),
                          })
                        }
                        className="h-8 px-3 rounded-lg bg-amber-500 text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                      >
                        Selesai
                      </button>
                    )}
                    {log.selesai && (
                      <span className="text-botanical-700 text-[13px] font-semibold">
                        ✓
                      </span>
                    )}
                  </div>
                </div>
                {log.mulai && (
                  <input
                    value={log.catatan || ""}
                    onChange={(e) =>
                      updateStepLog(s.urutan, {
                        catatan: e.target.value || null,
                      })
                    }
                    placeholder="Catatan / penyimpangan (opsional)"
                    className="w-full glass-input rounded-lg px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      {/* ===== IPC — QC PRODUK RUAHAN ===== */}
      {plan.qcOn && ipcRows.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 pt-5 pb-3 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-display text-[15px] font-semibold text-ink">
                Hasil Pengujian IPC
                <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-botanical-100 text-botanical-700 align-middle">
                  QC
                </span>
              </h3>
              <p className="text-muted text-[12px] mt-0.5">
                In-Process Control produk ruahan sebelum dikemas.
              </p>
            </div>
            <span className="text-[12px] text-muted">
              {ipcRows.filter((r) => r.hasil.trim()).length}/{ipcRows.length} terisi
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-y border-line bg-white/40">
                  <th className="px-4 py-2 font-semibold">Parameter</th>
                  <th className="px-4 py-2 font-semibold w-[210px]">Spesifikasi</th>
                  <th className="px-4 py-2 font-semibold w-[210px]">Hasil</th>
                </tr>
              </thead>
              <tbody>
                {ipcRows.map((r, i) => (
                  <tr key={r.nama} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">
                      {r.nama}
                      {r.satuan && (
                        <span className="text-muted text-[11.5px]"> ({r.satuan})</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={r.spesifikasi || ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setIpcRows((rs) =>
                            rs.map((x, j) => (j === i ? { ...x, spesifikasi: v } : x))
                          );
                        }}
                        placeholder="Spesifikasi"
                        className="w-full glass-input rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={r.hasil}
                        onChange={(e) => {
                          const v = e.target.value;
                          setIpcRows((rs) =>
                            rs.map((x, j) => (j === i ? { ...x, hasil: v } : x))
                          );
                        }}
                        placeholder="Hasil uji"
                        className="w-full glass-input rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===== HASIL PENGOLAHAN (RUAHAN) ===== */}
      <div className="glass rounded-2xl p-6">
        <h3 className="font-display text-[15px] font-semibold text-ink mb-1">
          Hasil Pengolahan
        </h3>
        <p className="text-muted text-[12.5px] mb-3">
          Jumlah produk ruahan yang benar-benar dihasilkan dari proses di atas.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-[11.5px] text-muted mb-1">
              Ruahan Teoritis
            </label>
            <div className="glass-input rounded-lg px-3 py-2.5 text-sm opacity-70">
              {formatId(plan.bulkKg)} kg
            </div>
          </div>
          <div>
            <label className="block text-[11.5px] text-muted mb-1">
              Ruahan Real (kg)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={bulkReal}
              onChange={(e) => setBulkReal(e.target.value)}
              placeholder={toStr(plan.bulkKg)}
              className={inputCls}
            />
          </div>
          <div className="text-[12.5px] pb-2.5">
            {parseNum(bulkReal) > 0 && plan.bulkKg > 0 && (
              <span
                className={
                  parseNum(bulkReal) >= plan.bulkKg * 0.97
                    ? "text-botanical-700 font-medium"
                    : "text-clay-600 font-medium"
                }
              >
                Rendemen{" "}
                {((parseNum(bulkReal) / plan.bulkKg) * 100).toLocaleString("id-ID", {
                  maximumFractionDigits: 1,
                })}
                %
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ============ TAHAP 2 — CATATAN PENGEMASAN BATCH ============ */}
      <div className="flex items-center gap-3 mt-2">
        <div className="bg-botanical-700 text-white rounded-lg px-3 py-1.5 text-[12px] font-semibold">
          TAHAP 2
        </div>
        <h2 className="font-display text-[17px] font-semibold text-ink">
          Catatan Pengemasan Batch
        </h2>
      </div>

      {/* ===== VARIAN & KEMASAN ===== */}
      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Hasil Kemas &amp; Pengambilan Kemasan
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Isi jumlah real yang dihasilkan per ukuran — kebutuhan kemasan
            terhitung otomatis, jumlah ambil bisa disesuaikan.
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

      {/* ===== REKONSILIASI KEMASAN ===== */}
      {kemasanIds.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-6 pt-5 pb-3">
            <h3 className="font-display text-[15px] font-semibold text-ink">
              Rekonsiliasi Kemasan
            </h3>
            <p className="text-muted text-[12px] mt-0.5">
              Diambil vs terpakai, rusak, dan sisa dikembalikan ke gudang —
              selisih harus nol.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="text-left text-muted text-[11px] uppercase tracking-wide border-y border-line bg-white/40">
                  <th className="px-4 py-2 font-semibold">Kemasan</th>
                  <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">Diambil</th>
                  <th className="px-4 py-2 font-semibold w-[120px]">Terpakai</th>
                  <th className="px-4 py-2 font-semibold w-[120px]">Rusak</th>
                  <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">Sisa</th>
                  <th className="px-4 py-2 font-semibold text-right whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {kemasanIds.map((id) => {
                  const it = itemOf(id);
                  const teoritis = kemasanTeoritis.get(id) || 0;
                  const diambil =
                    kemasanQty[id] !== undefined
                      ? parseNum(kemasanQty[id])
                      : teoritis;
                  const terpakai = parseNum(kemasanTerpakai[id] || "");
                  const rusak = parseNum(kemasanRusak[id] || "");
                  const sisa = diambil - terpakai - rusak;
                  const seimbang = Math.abs(sisa) < 0.0001 || sisa > 0;
                  return (
                    <tr key={id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2">
                        <div className="font-medium max-w-[180px] truncate">
                          {it?.nama || "—"}
                        </div>
                        <div className="text-[11px] text-muted font-mono">{it?.kode}</div>
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap font-mono text-[12px]">
                        {formatId(diambil)} {it?.satuan}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={kemasanTerpakai[id] || ""}
                          onChange={(e) =>
                            setKemasanTerpakai((s) => ({ ...s, [id]: e.target.value }))
                          }
                          placeholder="0"
                          className="w-full glass-input rounded-lg px-2.5 py-1.5 text-[13px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={kemasanRusak[id] || ""}
                          onChange={(e) =>
                            setKemasanRusak((s) => ({ ...s, [id]: e.target.value }))
                          }
                          placeholder="0"
                          className="w-full glass-input rounded-lg px-2.5 py-1.5 text-[13px] text-right focus:outline-none focus:ring-2 focus:ring-botanical-700"
                        />
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap font-mono text-[12px]">
                        {formatId(sisa)}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {terpakai > 0 || rusak > 0 ? (
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              seimbang
                                ? "bg-botanical-100 text-botanical-700"
                                : "bg-clay-100 text-clay-600"
                            }`}
                          >
                            {seimbang ? "Seimbang" : "Kurang"}
                          </span>
                        ) : (
                          <span className="text-muted text-[11.5px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
