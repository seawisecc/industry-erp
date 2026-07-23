"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { FEATURES, type FeatureFlags, type FeatureKey } from "@/lib/features";
import { saveFeatures } from "./actions";

export default function FeaturesForm({
  initial,
  canToggleMes,
}: {
  initial: FeatureFlags;
  canToggleMes: boolean;
}) {
  const router = useRouter();
  const [flags, setFlags] = useState<FeatureFlags>(initial);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const result = await saveFeatures(flags);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error || "Gagal menyimpan");
      }
    } catch {
      setError(
        "Gagal menyimpan — koneksi bermasalah atau aplikasi baru diperbarui. Muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {FEATURES.map((f) => {
        const on = flags[f.key as FeatureKey];
        const locked = !canToggleMes; // semua fitur berbayar dikendalikan Seawise
        return (
          <label
            key={f.key}
            className={`glass rounded-2xl p-5 flex items-start gap-4 transition-all ${
              f.ready && !locked ? "cursor-pointer" : locked ? "cursor-default" : "opacity-55 cursor-not-allowed"
            } ${on ? "ring-2 ring-botanical-700/40" : ""}`}
          >
            <input
              type="checkbox"
              checked={on}
              disabled={!f.ready || locked}
              onChange={(e) => {
                setSaved(false);
                setFlags((fl) => ({ ...fl, [f.key]: e.target.checked }));
              }}
              className="accent-[#2f4f3e] w-4 h-4 mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-[15px] font-semibold text-ink">
                  {f.label}
                </span>
                {on && f.ready && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-botanical-100 text-botanical-700">
                    <Zap size={11} /> Aktif
                  </span>
                )}
                {!f.ready && (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-100 text-amber-500">
                    Segera
                  </span>
                )}
                {locked && !on && (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-100 text-amber-500">
                    Paket Full
                  </span>
                )}
              </div>
              <p className="text-muted text-[12.5px] mt-1 leading-relaxed">
                {f.desc}
              </p>
              {locked && (
                <p className="text-[11.5px] text-muted mt-1">
                  {on
                    ? "Aktif sesuai paket berlangganan Anda."
                    : "Fitur paket Full — hubungi Seawise untuk mengaktifkan."}
                </p>
              )}
            </div>
          </label>
        );
      })}

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
      {saved && (
        <p className="text-botanical-700 text-[12.5px] font-medium">
          ✓ Pengaturan fitur tersimpan
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
        {loading ? "Menyimpan..." : "Simpan"}
      </button>
    </form>
  );
}
