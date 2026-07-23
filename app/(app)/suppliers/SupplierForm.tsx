"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSupplier, type SupplierInput } from "./actions";

export default function SupplierForm({
  id,
  initial,
}: {
  id?: string;
  initial?: Partial<SupplierInput>;
}) {
  const router = useRouter();
  const [nama, setNama] = useState(initial?.nama || "");
  const [alamat, setAlamat] = useState(initial?.alamat || "");
  const [namaKontak, setNamaKontak] = useState(initial?.nama_kontak || "");
  const [noTelp, setNoTelp] = useState(initial?.no_telp || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [npwp, setNpwp] = useState(initial?.npwp || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return; // guard: cegah double-submit
    setLoading(true);
    setError("");
    try {
      const result = await saveSupplier(
        {
          nama,
          alamat: alamat || null,
          nama_kontak: namaKontak || null,
          no_telp: noTelp || null,
          email: email || null,
          npwp: npwp || null,
        },
        id
      );
      if (result.ok) {
        router.push("/suppliers");
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
        <label className={labelCls}>Nama Supplier</label>
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          required
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Alamat</label>
        <textarea
          value={alamat}
          onChange={(e) => setAlamat(e.target.value)}
          rows={2}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Nama Kontak</label>
          <input
            value={namaKontak}
            onChange={(e) => setNamaKontak(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>No. Telp</label>
          <input
            value={noTelp}
            onChange={(e) => setNoTelp(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>NPWP</label>
          <input
            value={npwp}
            onChange={(e) => setNpwp(e.target.value)}
            className={inputCls}
          />
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
        {loading ? "Menyimpan..." : id ? "Simpan Perubahan" : "Simpan"}
      </button>
    </form>
  );
}
