"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateAccount } from "./actions";

type Props = {
  companyNama: string;
  adminNama: string;
  email: string;
};

export default function AccountForm({ companyNama, adminNama, email }: Props) {
  const router = useRouter();
  const supabase = createClient();

  // ---- Identitas ----
  const [company, setCompany] = useState(companyNama);
  const [nama, setNama] = useState(adminNama);
  const [idLoading, setIdLoading] = useState(false);
  const [idSaved, setIdSaved] = useState(false);
  const [idError, setIdError] = useState("");

  // ---- Password ----
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

  async function handleIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (idLoading) return;
    setIdLoading(true);
    setIdError("");
    setIdSaved(false);
    const result = await updateAccount({ company_nama: company, admin_nama: nama });
    if (result.ok) {
      setIdSaved(true);
      router.refresh();
    } else {
      setIdError(result.error || "Gagal menyimpan");
    }
    setIdLoading(false);
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwLoading) return;
    setPwError("");
    setPwSaved(false);

    if (pwNew.length < 6) {
      setPwError("Password baru minimal 6 karakter.");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError("Konfirmasi password tidak sama.");
      return;
    }

    setPwLoading(true);

    // 1. Verifikasi password lama dulu
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: pwCurrent,
    });
    if (verifyError) {
      setPwError("Password saat ini salah.");
      setPwLoading(false);
      return;
    }

    // 2. Ganti password
    const { error } = await supabase.auth.updateUser({ password: pwNew });
    if (error) {
      setPwError(error.message);
    } else {
      setPwSaved(true);
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
    }
    setPwLoading(false);
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";

  return (
    <div className="flex flex-col gap-5 mb-5">
      {/* ===== Identitas ===== */}
      <form onSubmit={handleIdentity} className="glass rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Akun &amp; Identitas
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Nama perusahaan tampil di sidebar &amp; dokumen; nama kamu tampil di
            sapaan dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Nama Perusahaan</label>
            <input
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                setIdSaved(false);
              }}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Nama Kamu (Admin)</label>
            <input
              value={nama}
              onChange={(e) => {
                setNama(e.target.value);
                setIdSaved(false);
              }}
              required
              className={inputCls}
            />
          </div>
        </div>

        {idError && <p className="text-clay-600 text-[12.5px]">{idError}</p>}
        {idSaved && (
          <p className="text-botanical-700 text-[12.5px] font-medium">✓ Tersimpan</p>
        )}

        <button
          type="submit"
          disabled={idLoading}
          className="self-start bg-botanical-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-70 flex items-center gap-2"
        >
          {idLoading && (
            <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {idLoading ? "Menyimpan..." : "Simpan Identitas"}
        </button>
      </form>

      {/* ===== Ganti Password ===== */}
      <form onSubmit={handlePassword} className="glass rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-display text-[15.5px] font-semibold text-ink">
            Ganti Password
          </h2>
          <p className="text-muted text-[12.5px] mt-0.5">
            Untuk akunmu sendiri ({email}). Password user lain diganti lewat menu
            Pengguna.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Password Saat Ini</label>
            <input
              type="password"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Password Baru</label>
            <input
              type="password"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              required
              minLength={6}
              placeholder="Min. 6 karakter"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Konfirmasi Password Baru</label>
            <input
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              required
              className={inputCls}
            />
          </div>
        </div>

        {pwError && <p className="text-clay-600 text-[12.5px]">{pwError}</p>}
        {pwSaved && (
          <p className="text-botanical-700 text-[12.5px] font-medium">
            ✓ Password berhasil diganti
          </p>
        )}

        <button
          type="submit"
          disabled={pwLoading}
          className="self-start bg-botanical-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-70 flex items-center gap-2"
        >
          {pwLoading && (
            <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {pwLoading ? "Memproses..." : "Ganti Password"}
        </button>
      </form>
    </div>
  );
}
