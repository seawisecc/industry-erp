"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setCompanyActive } from "./actions";

function plusDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export default function CompanyToggle({
  id,
  nama,
  aktif,
  aktifSampai,
}: {
  id: string;
  nama: string;
  aktif: boolean;
  aktifSampai: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tanggal, setTanggal] = useState(aktifSampai || plusDays(365));
  const [tanpaBatas, setTanpaBatas] = useState(aktif && !aktifSampai);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitAktif() {
    if (loading) return;
    setLoading(true);
    setError("");
    const result = await setCompanyActive(id, true, tanpaBatas ? null : tanggal);
    if (result.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError(result.error || "Gagal");
    }
    setLoading(false);
  }

  async function nonaktifkan() {
    if (loading) return;
    if (
      !confirm(
        `Nonaktifkan ${nama}? Semua user company ini tidak bisa memakai aplikasi.`
      )
    )
      return;
    setLoading(true);
    const result = await setCompanyActive(id, false, null);
    if (!result.ok) alert(result.error || "Gagal");
    router.refresh();
    setLoading(false);
  }

  const btnCls =
    "text-[12.5px] font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60";

  return (
    <div className="relative inline-flex gap-2 justify-end">
      {aktif && (
        <button
          onClick={nonaktifkan}
          disabled={loading}
          className={`${btnCls} text-clay-600 border border-clay-500/40 hover:bg-clay-100`}
        >
          Nonaktifkan
        </button>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className={`${btnCls} bg-botanical-700 text-white hover:bg-botanical-800`}
      >
        {aktif ? "Ubah Masa Aktif" : "Aktifkan"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
        <div
          onClick={(e) => e.stopPropagation()}
          className="glass rounded-2xl p-5 w-[300px] text-left shadow-xl bg-white/80"
        >
          <div className="text-[13.5px] font-semibold text-ink mb-0.5">{nama}</div>
          <div className="text-[12.5px] text-muted mb-3">Aktif sampai kapan?</div>

          <div className="flex gap-1.5 mb-2 flex-wrap">
            {[
              { label: "1 bln", days: 30 },
              { label: "3 bln", days: 90 },
              { label: "6 bln", days: 180 },
              { label: "1 thn", days: 365 },
            ].map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => {
                  setTanggal(plusDays(opt.days));
                  setTanpaBatas(false);
                }}
                className="text-[11.5px] px-2 py-1 rounded-md bg-botanical-100 text-botanical-700 hover:bg-botanical-700 hover:text-white transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>

          <input
            type="date"
            value={tanggal}
            disabled={tanpaBatas}
            onChange={(e) => setTanggal(e.target.value)}
            className="w-full glass-input rounded-lg px-3 py-2 text-[13px] mb-2 focus:outline-none focus:ring-2 focus:ring-botanical-700 disabled:opacity-50"
          />

          <label className="flex items-center gap-2 text-[12.5px] mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={tanpaBatas}
              onChange={(e) => setTanpaBatas(e.target.checked)}
              className="accent-[#2f4f3e]"
            />
            Tanpa batas waktu
          </label>

          {error && <p className="text-clay-600 text-[12px] mb-2">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitAktif}
              disabled={loading || (!tanpaBatas && !tanggal)}
              className="flex-1 bg-botanical-700 text-white rounded-lg py-2 text-[12.5px] font-medium hover:bg-botanical-800 disabled:opacity-60"
            >
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-lg text-[12.5px] text-muted hover:text-ink"
            >
              Batal
            </button>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
