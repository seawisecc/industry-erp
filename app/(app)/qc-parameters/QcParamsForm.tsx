"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Sparkles } from "lucide-react";
import {
  QC_KATEGORI,
  GRUP_SARAN,
  PARAM_STANDAR,
  type QcKategoriKey,
  type QcParamInput,
} from "@/lib/qcParams";
import { saveQcParameters } from "./actions";

export default function QcParamsForm({ initial }: { initial: QcParamInput[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<QcParamInput[]>(initial);
  const [tab, setTab] = useState<QcKategoriKey>("bahan_baku");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Indeks baris (di array utuh) yang termasuk kategori aktif
  const idxs = rows
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.kategori === tab)
    .map((x) => x.i);

  function update(idx: number, patch: Partial<QcParamInput>) {
    setSaved(false);
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function isiStandar() {
    setSaved(false);
    const ada = new Set(
      rows
        .filter((r) => r.kategori === tab)
        .map((r) => r.nama.trim().toLowerCase())
    );
    const tambahan = PARAM_STANDAR[tab].filter(
      (p) => !ada.has(p.nama.toLowerCase())
    );
    setRows((rs) => [...rs, ...tambahan]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setSaved(false);
    const result = await saveQcParameters(rows);
    if (result.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError(result.error || "Gagal menyimpan");
    }
    setLoading(false);
  }

  const inputCls =
    "w-full glass-input rounded-lg px-2.5 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* ===== Tab kategori ===== */}
      <div className="flex flex-wrap gap-2">
        {QC_KATEGORI.map((k) => {
          const jml = rows.filter(
            (r) => r.kategori === k.key && r.aktif && r.nama.trim()
          ).length;
          const active = tab === k.key;
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => setTab(k.key)}
              className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-[12.5px] font-medium border transition-colors ${
                active
                  ? "bg-botanical-700 text-white border-botanical-700 shadow-sm"
                  : "bg-white/70 text-ink border-line hover:bg-white"
              }`}
            >
              {k.label}
              <span
                className={`text-[10.5px] px-1.5 rounded-full ${
                  active ? "bg-white/20" : "bg-botanical-100 text-botanical-700"
                }`}
              >
                {jml}
              </span>
            </button>
          );
        })}
      </div>

      <div className="glass rounded-2xl p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink">
              {QC_KATEGORI.find((k) => k.key === tab)?.label}
            </h3>
            <p className="text-muted text-[12px] mt-0.5">
              Parameter yang dicentang tampil di lembar pengujian. Spesifikasi
              tiap bahan diisi QC saat pengujian pertama, lalu tersimpan otomatis.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isiStandar}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/70 border border-line text-[12px] font-medium hover:bg-white transition-colors"
            >
              <Sparkles size={13} /> Isi Parameter Standar
            </button>
            <button
              type="button"
              onClick={() =>
                setRows((rs) => [
                  ...rs,
                  {
                    kategori: tab,
                    nama: "",
                    satuan: "",
                    spesifikasi: "",
                    grup: "",
                    aktif: true,
                  },
                ])
              }
              className="inline-flex items-center gap-1 text-botanical-700 text-[12.5px] font-medium hover:underline"
            >
              <Plus size={14} /> Tambah
            </button>
          </div>
        </div>

        {idxs.length === 0 && (
          <p className="text-muted text-[13px] py-2">
            Belum ada parameter untuk kategori ini. Klik{" "}
            <b>Isi Parameter Standar</b> untuk memuat parameter umum, lalu
            sesuaikan.
          </p>
        )}

        {idxs.length > 0 && (
          <div className="hidden sm:grid grid-cols-[36px_1fr_120px_170px_36px] gap-2 text-[11px] uppercase tracking-wide text-muted px-1">
            <div className="text-center">Aktif</div>
            <div>Parameter</div>
            <div>Satuan</div>
            <div>Grup</div>
            <div />
          </div>
        )}

        {idxs.map((i) => {
          const r = rows[i];
          return (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-[36px_1fr_120px_170px_36px] gap-2 items-center"
            >
              <div className="flex justify-center">
                <input
                  type="checkbox"
                  checked={r.aktif}
                  onChange={(e) => update(i, { aktif: e.target.checked })}
                  title="Tampilkan di lembar pengujian"
                  className="accent-[#2f4f3e] w-4 h-4"
                />
              </div>
              <input
                value={r.nama}
                onChange={(e) => update(i, { nama: e.target.value })}
                placeholder="Nama parameter"
                className={`${inputCls} ${r.aktif ? "" : "opacity-50"}`}
              />
              <input
                value={r.satuan || ""}
                onChange={(e) => update(i, { satuan: e.target.value })}
                placeholder="satuan"
                className={`${inputCls} ${r.aktif ? "" : "opacity-50"}`}
              />
              <input
                value={r.grup || ""}
                onChange={(e) => update(i, { grup: e.target.value })}
                list="grup-saran"
                placeholder="Grup"
                className={`${inputCls} ${r.aktif ? "" : "opacity-50"}`}
              />
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                className="text-muted hover:text-clay-600 p-1.5 justify-self-center"
                title="Hapus parameter"
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
        <datalist id="grup-saran">
          {GRUP_SARAN.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
      {saved && (
        <p className="text-botanical-700 text-[12.5px] font-medium">
          ✓ Parameter uji tersimpan (semua kategori)
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Menyimpan..." : "Simpan Parameter"}
      </button>
    </form>
  );
}
