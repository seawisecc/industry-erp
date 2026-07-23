"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveService } from "./actions";

function parseNum(s: string) {
  return parseFloat(s.replace(",", ".")) || 0;
}

export default function ServiceForm({
  id,
  initial,
}: {
  id?: string;
  initial?: {
    nama_jasa: string;
    keterangan: string | null;
    biaya: number;
    aktif: boolean;
  };
}) {
  const router = useRouter();
  const [nama, setNama] = useState(initial?.nama_jasa || "");
  const [keterangan, setKeterangan] = useState(initial?.keterangan || "");
  const [biaya, setBiaya] = useState(
    initial?.biaya == null ? "" : String(initial.biaya)
  );
  const [aktif, setAktif] = useState(initial?.aktif ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // guard: cegah double-submit
    setLoading(true);
    setError("");
    try {
      const result = await saveService(
        {
          nama_jasa: nama,
          keterangan: keterangan || null,
          biaya: parseNum(biaya),
          aktif,
        },
        id
      );
      if (result.ok) {
        router.push("/services");
        router.refresh();
      } else {
        setError(result.error || "Gagal menyimpan");
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
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <label className={labelCls}>Nama Jasa</label>
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          required
          placeholder="Misal: Jasa Formulasi / Uji Stabilitas / Notifikasi BPOM"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>
          Keterangan <span className="font-normal text-muted/70">(opsional)</span>
        </label>
        <textarea
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          rows={3}
          placeholder="Cakupan pekerjaan, durasi, catatan penting untuk client"
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Biaya (Rp)</label>
          <input
            type="text"
            inputMode="decimal"
            value={biaya}
            onChange={(e) => setBiaya(e.target.value)}
            required
            placeholder="Misal: 5000000"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Status</label>
          <select
            value={aktif ? "1" : "0"}
            onChange={(e) => setAktif(e.target.value === "1")}
            className={inputCls}
          >
            <option value="1">Aktif</option>
            <option value="0">Nonaktif</option>
          </select>
        </div>
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
        {loading ? "Menyimpan..." : id ? "Simpan Perubahan" : "Simpan Jasa"}
      </button>
    </form>
  );
}
