"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientData, updateClientData } from "./actions";

const KATEGORI = [
  "Brand Owner",
  "University/Corporation",
  "Research",
  "Reseller",
  "Walk In Customer",
  "Other",
];

type Props = {
  client?: {
    id: string;
    company_brand: string;
    cp: string | null;
    npwp: string | null;
    phone: string | null;
    kategori: string;
    alamat: string | null;
    aktif: boolean;
  };
};

export default function ClientForm({ client }: Props) {
  const router = useRouter();
  const isEdit = !!client;

  const [company, setCompany] = useState(client?.company_brand || "");
  const [cp, setCp] = useState(client?.cp || "");
  const [npwp, setNpwp] = useState(client?.npwp || "");
  const [phone, setPhone] = useState(client?.phone || "");
  const [kategori, setKategori] = useState(client?.kategori || "Brand Owner");
  const [alamat, setAlamat] = useState(client?.alamat || "");
  const [aktif, setAktif] = useState(client?.aktif ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    const payload = {
      company_brand: company,
      cp: cp || null,
      npwp: npwp || null,
      phone: phone || null,
      kategori,
      alamat: alamat || null,
      aktif,
    };
    try {
      const result =
        isEdit && client
          ? await updateClientData(client.id, payload)
          : await createClientData(payload);
      if (result.ok) {
        router.push("/clients");
        router.refresh();
      } else {
        setError(result.error || "Gagal menyimpan client");
        setLoading(false);
      }
    } catch {
      // Mis. koneksi putus atau versi aplikasi baru saja ter-deploy —
      // hentikan loading dan minta user coba lagi.
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Company / Brand</label>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            placeholder="Nama perusahaan atau brand"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Kategori</label>
          <select
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
            className={inputCls}
          >
            {KATEGORI.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>
            Contact Person <span className="font-normal text-muted/70">(CP)</span>
          </label>
          <input value={cp} onChange={(e) => setCp(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08xx"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>NPWP</label>
          <input
            value={npwp}
            onChange={(e) => setNpwp(e.target.value)}
            placeholder="xx.xxx.xxx.x-xxx.xxx"
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="sm:col-span-3">
          <label className={labelCls}>Alamat</label>
          <textarea
            value={alamat}
            onChange={(e) => setAlamat(e.target.value)}
            rows={2}
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
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
      >
        {loading && (
          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Simpan Client"}
      </button>
    </form>
  );
}
