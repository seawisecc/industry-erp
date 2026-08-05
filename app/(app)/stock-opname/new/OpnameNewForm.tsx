"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStockOpname } from "../actions";

export default function OpnameNewForm({
  hariIni,
  jumlah,
}: {
  /** Tanggal kalender zona operasional, dihitung di server (lib/dates.ts) */
  hariIni: string;
  /** jumlah item aktif per kategori, untuk memperkirakan cakupan */
  jumlah: { semua: number; bahan: number; kemasan: number };
}) {
  const router = useRouter();
  const [tanggal, setTanggal] = useState(hariIni);
  const [kategori, setKategori] = useState("");
  const [catatan, setCatatan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cakupan =
    kategori === "Bahan Baku"
      ? jumlah.bahan
      : kategori === "Kemasan"
        ? jumlah.kemasan
        : jumlah.semua;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await createStockOpname({
        tanggal,
        kategori: kategori || null,
        catatan: catatan.trim() || null,
      });
      if (res.ok && res.id) {
        router.push(`/stock-opname/${res.id}`);
        router.refresh();
      } else {
        setError(res.error || "Gagal membuka opname");
        setLoading(false);
      }
    } catch {
      setError(
        "Gagal membuka opname. Koneksi bermasalah atau aplikasi baru diperbarui, muat ulang halaman lalu coba lagi."
      );
      setLoading(false);
    }
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Tanggal Opname</label>
          <input
            type="date"
            value={tanggal}
            onChange={(e) => setTanggal(e.target.value)}
            required
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Cakupan</label>
          <select
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
            className={inputCls}
          >
            <option value="">Semua item</option>
            <option value="Bahan Baku">Bahan Baku saja</option>
            <option value="Kemasan">Kemasan saja</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>
            Catatan <span className="font-normal text-muted/70">(opsional)</span>
          </label>
          <input
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="mis. opname akhir bulan, tim gudang A"
            className={inputCls}
          />
        </div>
      </div>

      <div className="glass rounded-2xl px-5 py-4 text-[12.5px] leading-relaxed">
        <b>{cakupan.toLocaleString("id-ID")} item aktif</b> akan masuk lembar
        hitung. Stok sistemnya dipotret saat opname dibuka, dan lembar
        cetaknya sengaja <b>tidak memuat angka itu</b> supaya penghitungan
        fisiknya jujur.
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}

      <button
        type="submit"
        disabled={loading || cakupan === 0}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Membuka..." : "Buka Opname & Potret Stok"}
      </button>
      {cakupan === 0 && (
        <p className="text-muted text-[12px] text-center -mt-3">
          Tidak ada item aktif pada cakupan ini.
        </p>
      )}
    </form>
  );
}
