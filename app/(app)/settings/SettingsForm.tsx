"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSettings, SettingsInput } from "./actions";

type Props = {
  initial: SettingsInput | null;
};

export default function SettingsForm({ initial }: Props) {
  const router = useRouter();

  const [form, setForm] = useState<Record<string, string>>({
    alamat: initial?.alamat || "",
    no_telp: initial?.no_telp || "",
    email: initial?.email || "",
    npwp: initial?.npwp || "",
    bank_info: initial?.bank_info || "",
    sign_dibuat_nama: initial?.sign_dibuat_nama || "",
    sign_dibuat_jabatan: initial?.sign_dibuat_jabatan || "",
    sign_disetujui_nama: initial?.sign_disetujui_nama || "",
    sign_disetujui_jabatan: initial?.sign_disetujui_jabatan || "",
    sign_mengetahui_nama: initial?.sign_mengetahui_nama || "",
    sign_mengetahui_jabatan: initial?.sign_mengetahui_jabatan || "",
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      await saveSettings(form as unknown as SettingsInput);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengaturan");
    }
    setLoading(false);
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="font-display text-[15.5px] font-semibold text-ink">
          Data Perusahaan
        </h2>
        <p className="text-muted text-[12.5px] -mt-3">
          Muncul di kop dokumen cetak (PO, dsb).
        </p>

        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Alamat
          </label>
          <textarea
            value={form.alamat}
            onChange={(e) => set("alamat", e.target.value)}
            rows={2}
            placeholder="Alamat lengkap perusahaan"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              No. Telepon
            </label>
            <input
              value={form.no_telp}
              onChange={(e) => set("no_telp", e.target.value)}
              placeholder="021-xxx / 08xx"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="info@perusahaan.com"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-medium text-muted mb-1.5">
              NPWP
            </label>
            <input
              value={form.npwp}
              onChange={(e) => set("npwp", e.target.value)}
              placeholder="xx.xxx.xxx.x-xxx.xxx"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="block text-[12.5px] font-medium text-muted mb-1.5">
            Rekening Bank{" "}
            <span className="font-normal text-muted/70">(tampil di invoice)</span>
          </label>
          <input
            value={form.bank_info}
            onChange={(e) => set("bank_info", e.target.value)}
            placeholder="Misal: BCA - 7705299919 a.n. PT ..."
            className={inputCls}
          />
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <h2 className="font-display text-[15.5px] font-semibold text-ink">
          Pengesahan Dokumen
        </h2>
        <p className="text-muted text-[12.5px] mt-1">
          Pengaturan kolom tanda tangan kini punya menu sendiri — bisa diatur
          per jenis dokumen (PO, Penerimaan, Produksi, Invoice) di{" "}
          <a
            href="/document-signing"
            className="text-botanical-700 font-medium hover:underline"
          >
            Settings → Document Signing
          </a>
          .
        </p>
      </div>

      {error && <p className="text-clay-600 text-[12.5px]">{error}</p>}
      {saved && (
        <p className="text-botanical-700 text-[12.5px] font-medium">
          ✓ Pengaturan tersimpan
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-60"
      >
        {loading ? "Menyimpan..." : "Simpan Pengaturan"}
      </button>
    </form>
  );
}
