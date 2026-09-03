"use client";

import { useState } from "react";
import InstallAppButton from "@/components/InstallAppButton";
import Link from "next/link";
import { Check, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import { registerCompany } from "./actions";

type Mode = "signin" | "signup";

const EASE = "cubic-bezier(.77, 0, .18, 1)";
const OVERLAY_GRADIENT =
  "linear-gradient(135deg, #16261D 0%, #2F4D3A 55%, #C1623D 130%)";

/**
 * Tiga alasan, bukan daftar fitur.
 *
 * Halaman ini sering jadi layar PERTAMA yang dilihat orang: link-nya
 * dikirim ke calon pengguna sebelum mereka tahu aplikasi ini apa. Kalau
 * yang tampil cuma dua kolom isian, tidak ada yang bisa dinilai.
 */
const NILAI = [
  "Siap audit CPKB. Setiap perubahan dokumen tercatat siapa dan kapan.",
  "Stok FEFO dan HPP real, dihitung dari pemakaian bahan per batch.",
  "QC dan QA menyatu. Batch yang ditahan tidak bisa ikut terjual.",
];

/**
 * Pesan Supabase mentah tidak pernah ditampilkan apa adanya: isinya
 * bahasa Inggris teknis, dan sebagiannya membocorkan apakah sebuah email
 * terdaftar atau tidak.
 */
function pesanLogin(mentah: string) {
  const m = mentah.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials"))
    return "Email atau password salah.";
  if (m.includes("email not confirmed"))
    return "Email ini belum dikonfirmasi. Cek kotak masuk untuk tautan konfirmasinya.";
  if (m.includes("too many") || m.includes("rate limit"))
    return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Tidak bisa terhubung ke server. Periksa koneksi internet lalu coba lagi.";
  return "Gagal masuk. Coba lagi sebentar lagi.";
}

export default function LoginPage() {
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("signin");

  // ---- Sign in ----
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lihatPassword, setLihatPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ---- Sign up ----
  const [rCompany, setRCompany] = useState("");
  const [rNama, setRNama] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPassword, setRPassword] = useState("");
  const [rConfirm, setRConfirm] = useState("");
  const [rLihat, setRLihat] = useState(false);
  const [rError, setRError] = useState("");
  const [rLoading, setRLoading] = useState(false);
  const [rSuccess, setRSuccess] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setLoading(false);
        setError(pesanLogin(error.message));
        return;
      }
    } catch (err) {
      setLoading(false);
      setError(pesanLogin(err instanceof Error ? err.message : ""));
      return;
    }
    // Hard navigation: mengosongkan seluruh cache router dari sesi sebelumnya
    // (mencegah redirect basi/data user lama muncul setelah ganti akun).
    //
    // Tujuannya "/" bukan "/dashboard": halaman ini tidak tahu hak akses
    // siapa pun, dan dashboard adalah modul yang bisa tidak diberikan.
    // Yang menghitung pendaratannya app/page.tsx di server.
    window.location.assign("/");
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (rLoading) return;
    if (rPassword !== rConfirm) {
      setRError("Konfirmasi password tidak sama.");
      return;
    }
    setRLoading(true);
    setRError("");
    const result = await registerCompany({
      company: rCompany,
      nama: rNama,
      email: rEmail,
      password: rPassword,
    });
    if (result.ok) {
      setRSuccess(true);
    } else {
      setRError(result.error);
    }
    setRLoading(false);
  }

  const inputCls =
    "w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const labelCls = "block text-[12.5px] font-medium text-muted mb-1.5";
  // Tombol mata di dalam kolom password. 40x40 supaya tetap kena di HP.
  const mataCls =
    "absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 inline-flex items-center justify-center rounded-lg text-muted hover:text-ink focus:outline-none focus:ring-2 focus:ring-botanical-700";
  const errorCls =
    "text-clay-600 text-[12.5px] mb-4 leading-relaxed";

  const isSignup = mode === "signup";

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-[900px] glass rounded-3xl overflow-hidden sm:min-h-[600px]">
        {/* ================= PANEL SIGN IN (kiri) ================= */}
        <div
          className={`p-6 sm:p-8 lg:p-12 sm:absolute sm:inset-y-0 sm:left-0 sm:w-1/2 flex-col justify-center ${
            isSignup ? "hidden sm:flex" : "flex"
          }`}
          style={{
            transition: `opacity 500ms ${EASE}, transform 900ms ${EASE}`,
            opacity: isSignup ? 0 : 1,
            transform: isSignup ? "translateX(-40px)" : "none",
            pointerEvents: isSignup ? "none" : "auto",
            filter: isSignup ? "blur(4px)" : "none",
          }}
          // Panel yang sedang tersembunyi tidak boleh bisa di-tab: kalau
          // hanya diberi opacity 0, Tab tetap masuk ke isian yang tak terlihat.
          inert={isSignup}
          aria-hidden={isSignup}
        >
          <div className="flex items-center gap-3 mb-7">
            <div className="bg-botanical-900/90 rounded-xl p-2 shadow-sm">
              <Logo size={24} />
            </div>
            <div>
              <div className="font-display font-semibold text-[16px]">
                Industry Management
              </div>
              <div className="text-[11px] text-muted">by Seawise Studio</div>
            </div>
          </div>

          <div className="text-[11px] uppercase tracking-[0.15em] text-clay-600 font-semibold mb-1">
            Selamat datang kembali
          </div>
          <h1 className="font-display text-[26px] font-semibold text-ink mb-6">
            Masuk
          </h1>

          <form onSubmit={handleLogin}>
            <label className={labelCls} htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputCls} mb-4`}
              placeholder="nama@perusahaan.com"
            />

            <label className={labelCls} htmlFor="login-password">
              Password
            </label>
            <div className="relative mb-5">
              <input
                id="login-password"
                name="password"
                type={lihatPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-12`}
                placeholder="Password akunmu"
              />
              <button
                type="button"
                onClick={() => setLihatPassword((v) => !v)}
                aria-label={
                  lihatPassword ? "Sembunyikan password" : "Tampilkan password"
                }
                aria-pressed={lihatPassword}
                className={mataCls}
              >
                {lihatPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            {/* aria-live: pembaca layar mengumumkan errornya tanpa fokus pindah */}
            <p role="alert" aria-live="polite" className={error ? errorCls : "sr-only"}>
              {error}
            </p>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-botanical-700 text-white rounded-lg py-3 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {loading && (
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {loading ? "Sedang masuk..." : "Masuk"}
            </button>
          </form>

          {/* Nilai produk versi HP. Di layar lebar tugas ini dipegang
              panel gradien di sebelah kanan. */}
          <ul className="sm:hidden mt-6 flex flex-col gap-2 border-t border-line pt-5">
            {NILAI.map((n) => (
              <li key={n} className="flex gap-2 text-[12.5px] text-muted leading-relaxed">
                <Check size={15} className="shrink-0 mt-0.5 text-botanical-700" />
                <span>{n}</span>
              </li>
            ))}
          </ul>

          {/* Toggle mobile */}
          <p className="sm:hidden text-[12.5px] text-muted mt-5 text-center">
            Perusahaan baru?{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="text-botanical-700 font-medium hover:underline"
            >
              Daftar di sini
            </button>
          </p>
        </div>

        {/* ================= PANEL SIGN UP (kanan) ================= */}
        <div
          className={`p-6 sm:p-8 lg:p-12 sm:absolute sm:inset-y-0 sm:right-0 sm:w-1/2 flex-col justify-center ${
            isSignup ? "flex" : "hidden sm:flex"
          }`}
          style={{
            transition: `opacity 500ms ${EASE}, transform 900ms ${EASE}`,
            opacity: isSignup ? 1 : 0,
            transform: isSignup ? "none" : "translateX(40px)",
            pointerEvents: isSignup ? "auto" : "none",
            filter: isSignup ? "none" : "blur(4px)",
          }}
          inert={!isSignup}
          aria-hidden={!isSignup}
        >
          {rSuccess ? (
            <div className="text-center sm:text-left">
              <div className="text-[38px] mb-3">🎉</div>
              <h2 className="font-display text-[24px] font-semibold text-ink mb-2">
                Pendaftaran Berhasil!
              </h2>
              <p className="text-muted text-[13.5px] leading-relaxed mb-6">
                Akun perusahaanmu sudah dibuat dan sedang{" "}
                <b>menunggu aktivasi</b> dari tim Seawise. Kamu akan bisa
                menggunakan aplikasi begitu perusahaanmu diaktifkan.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setRSuccess(false);
                }}
                className="bg-botanical-700 text-white rounded-lg px-5 py-3 text-sm font-medium hover:bg-botanical-800 transition-all"
              >
                Kembali ke Masuk
              </button>
            </div>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-[0.15em] text-clay-600 font-semibold mb-1">
                Gabung sekarang
              </div>
              <h2 className="font-display text-[26px] font-semibold text-ink mb-1">
                Daftarkan Perusahaan
              </h2>
              <p className="text-muted text-[12.5px] mb-5">
                Gratis mendaftar, aktivasi dilakukan oleh tim Seawise.
              </p>

              <form onSubmit={handleRegister}>
                <label className={labelCls} htmlFor="reg-company">
                  Nama Perusahaan
                </label>
                <input
                  id="reg-company"
                  name="organization"
                  autoComplete="organization"
                  required
                  value={rCompany}
                  onChange={(e) => setRCompany(e.target.value)}
                  className={`${inputCls} mb-3`}
                  placeholder="PT Maju Kosmetik Indonesia"
                />

                {/* Dua kolom baru dari lg: di 768px panel ini cuma selebar
                    setengah kartu, dan grid dua kolom membuat isiannya
                    sempit sekali. */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls} htmlFor="reg-nama">
                      Nama Lengkap
                    </label>
                    <input
                      id="reg-nama"
                      name="name"
                      autoComplete="name"
                      required
                      value={rNama}
                      onChange={(e) => setRNama(e.target.value)}
                      className={inputCls}
                      placeholder="Nama admin"
                    />
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="reg-email">
                      Email
                    </label>
                    <input
                      id="reg-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      value={rEmail}
                      onChange={(e) => setREmail(e.target.value)}
                      className={inputCls}
                      placeholder="kamu@perusahaan.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className={labelCls} htmlFor="reg-password">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="reg-password"
                        name="new-password"
                        type={rLihat ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={rPassword}
                        onChange={(e) => setRPassword(e.target.value)}
                        className={`${inputCls} pr-12`}
                        placeholder="Min. 6 karakter"
                      />
                      <button
                        type="button"
                        onClick={() => setRLihat((v) => !v)}
                        aria-label={
                          rLihat ? "Sembunyikan password" : "Tampilkan password"
                        }
                        aria-pressed={rLihat}
                        className={mataCls}
                      >
                        {rLihat ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls} htmlFor="reg-confirm">
                      Konfirmasi
                    </label>
                    <input
                      id="reg-confirm"
                      name="confirm-password"
                      type={rLihat ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={rConfirm}
                      onChange={(e) => setRConfirm(e.target.value)}
                      className={inputCls}
                      placeholder="Ulangi password"
                    />
                  </div>
                </div>

                <p
                  role="alert"
                  aria-live="polite"
                  className={rError ? errorCls : "sr-only"}
                >
                  {rError}
                </p>

                <button
                  type="submit"
                  disabled={rLoading}
                  className="w-full bg-botanical-700 text-white rounded-lg py-3 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {rLoading && (
                    <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  )}
                  {rLoading ? "Mendaftarkan..." : "Daftarkan Perusahaan"}
                </button>
              </form>

              <p className="sm:hidden text-[12.5px] text-muted mt-5 text-center">
                Sudah punya akun?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="text-botanical-700 font-medium hover:underline"
                >
                  Masuk
                </button>
              </p>
            </>
          )}
        </div>

        {/* ================= OVERLAY GESER (desktop) ================= */}
        <div
          className="hidden sm:flex absolute inset-y-0 left-1/2 w-1/2 z-10 items-center justify-center text-white"
          style={{
            background: OVERLAY_GRADIENT,
            transform: isSignup ? "translateX(-100%)" : "translateX(0)",
            clipPath: isSignup
              ? "polygon(0 0, 86% 0, 100% 100%, 0 100%)"
              : "polygon(14% 0, 100% 0, 100% 100%, 0 100%)",
            transition: `transform 900ms ${EASE}, clip-path 900ms ${EASE}`,
          }}
        >
          {/* Konten saat menutupi kanan (mode signin) */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center px-8 lg:px-12"
            style={{
              transition: `opacity 450ms ${EASE}`,
              opacity: isSignup ? 0 : 1,
              pointerEvents: isSignup ? "none" : "auto",
            }}
            inert={isSignup}
            aria-hidden={isSignup}
          >
            <Logo size={40} />
            <div className="font-display text-[20px] font-semibold mt-4 text-center">
              Industry Management
            </div>
            <div className="text-[11px] uppercase tracking-[0.15em] text-white/60 mt-1 mb-6">
              by Seawise Studio
            </div>

            <ul className="flex flex-col gap-3 max-w-[300px] mb-7">
              {NILAI.map((n) => (
                <li key={n} className="flex gap-2.5 text-[12.5px] leading-relaxed text-white/85">
                  <Check size={16} className="shrink-0 mt-0.5 text-white" />
                  <span>{n}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setMode("signup")}
              className="border border-white/50 rounded-lg px-6 py-3 text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Daftarkan Perusahaan
            </button>
            <Link
              href="/kenapa"
              className="text-[12.5px] text-white/70 hover:text-white underline underline-offset-4 mt-4"
            >
              Lihat kemampuan lengkapnya
            </Link>
          </div>

          {/* Konten saat menutupi kiri (mode signup) */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 lg:px-12"
            style={{
              transition: `opacity 450ms ${EASE}`,
              opacity: isSignup ? 1 : 0,
              pointerEvents: isSignup ? "auto" : "none",
            }}
            inert={!isSignup}
            aria-hidden={!isSignup}
          >
            <Logo size={40} />
            <h2 className="font-display text-[24px] font-semibold mt-4 mb-2">
              Sudah jadi member?
            </h2>
            <p className="text-white/70 text-[13px] leading-relaxed mb-6 max-w-[280px]">
              Masuk dan lanjutkan pekerjaanmu dari tempat terakhir.
            </p>
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="border border-white/50 rounded-lg px-6 py-3 text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Masuk
            </button>
          </div>
        </div>
      </div>

      {/* Satu-satunya jalan ke /kenapa saat mode Daftar dan di seluruh
          tampilan HP: tautan di panel hijau hanya ada di desktop mode Masuk. */}
      <p className="text-[12.5px] text-muted mt-5 text-center">
        Industry Management by Seawise Studio ·{" "}
        <Link
          href="/kenapa"
          className="text-botanical-700 font-medium hover:underline"
        >
          Kenapa Seawise? →
        </Link>
      </p>

      {/* Ditawarkan di sini karena inilah satu-satunya halaman yang pasti
          dilihat semua orang, termasuk yang belum pernah masuk. Tidak
          merender apa pun kalau browsernya tidak bisa memasang. */}
      <div className="mt-4 flex justify-center">
        <InstallAppButton variant="login" />
      </div>
    </div>
  );
}
