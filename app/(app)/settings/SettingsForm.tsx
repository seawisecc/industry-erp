"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSettings, SettingsInput } from "./actions";

type Props = {
  initial: SettingsInput | null;
};

const SIGNERS = [
  { key: "dibuat", label: "Dibuat oleh", hint: "Biasanya staff purchasing" },
  { key: "disetujui", label: "Disetujui oleh", hint: "Biasanya manager/owner" },
  { key: "mengetahui", label: "Mengetahui", hint: "Biasanya direktur" },
] as const;

export default function SettingsForm({ initial }: Props) {
  const router = useRouter();

  const [form, setForm] = useState<Record<string, string>>({
    alamat: initial?.alamat || "",
    no_telp: initial?.no_telp || "",
    email: initial?.email || "",
    npwp: initial?.npwp || "",
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
      </div>

      <div className="glass rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="font-display text-[15.5px] font-semibold text-ink">
          Pengesahan Dokumen (3 Key Person)
        </h2>
        <p className="text-muted text-[12.5px] -mt-3">
          Nama &amp; jabatan yang muncul di kolom tanda tangan dokumen PO.
        </p>

        {SIGNERS.map((s) => (
          <div key={s.key} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_1fr] gap-3 items-center">
            <div>
              <div className="text-[13px] font-medium">{s.label}</div>
              <div className="text-[11.5px] text-muted">{s.hint}</div>
            </div>
            <input
              value={form[`sign_${s.key}_nama`]}
              onChange={(e) => set(`sign_${s.key}_nama`, e.target.value)}
              placeholder="Nama"
              className={inputCls}
            />
            <input
              value={form[`sign_${s.key}_jabatan`]}
              onChange={(e) => set(`sign_${s.key}_jabatan`, e.target.value)}
              placeholder="Jabatan"
              className={inputCls}
            />
          </div>
        ))}
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
