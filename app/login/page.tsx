"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";
import { registerCompany } from "./actions";

type Mode = "signin" | "signup";

const EASE = "cubic-bezier(.77, 0, .18, 1)";
const OVERLAY_GRADIENT =
  "linear-gradient(135deg, #16261D 0%, #2F4D3A 55%, #C1623D 130%)";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("signin");

  // ---- Sign in ----
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ---- Sign up ----
  const [rCompany, setRCompany] = useState("");
  const [rNama, setRNama] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPassword, setRPassword] = useState("");
  const [rConfirm, setRConfirm] = useState("");
  const [rError, setRError] = useState("");
  const [rLoading, setRLoading] = useState(false);
  const [rSuccess, setRSuccess] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError("Email atau password salah.");
      return;
    }
    // loading tetap true selama redirect, biar tombol jelas "sedang bekerja"
    router.push("/dashboard");
    router.refresh();
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

  const isSignup = mode === "signup";

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="relative w-full max-w-[900px] glass rounded-3xl overflow-hidden sm:min-h-[600px]">
        {/* ================= PANEL SIGN IN (kiri) ================= */}
        <div
          className={`p-8 sm:p-12 sm:absolute sm:inset-y-0 sm:left-0 sm:w-1/2 flex-col justify-center ${
            isSignup ? "hidden sm:flex" : "flex"
          }`}
          style={{
            transition: `opacity 500ms ${EASE}, transform 900ms ${EASE}`,
            opacity: isSignup ? 0 : 1,
            transform: isSignup ? "translateX(-40px)" : "none",
            pointerEvents: isSignup ? "none" : "auto",
            filter: isSignup ? "blur(4px)" : "none",
          }}
        >
          <div className="flex items-center gap-3 mb-7">
            <div className="bg-botanical-900/90 rounded-xl p-2 shadow-sm">
              <Logo size={24} />
            </div>
            <div>
              <div className="font-display font-semibold text-[16px]">
                Seawise Enterprise Apps
              </div>
              <div className="text-[11px] text-muted">Industry Edition</div>
            </div>
          </div>

          <div className="text-[11px] uppercase tracking-[0.15em] text-clay-600 font-semibold mb-1">
            Selamat datang kembali
          </div>
          <h1 className="font-display text-[26px] font-semibold text-ink mb-6">
            Masuk
          </h1>

          <form onSubmit={handleLogin}>
            <label className={labelCls}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputCls} mb-4`}
              placeholder="nama@perusahaan.com"
            />

            <label className={labelCls}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputCls} mb-5`}
            />

            {error && <p className="text-clay-600 text-[12.5px] mb-4">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {loading && (
                <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {loading ? "Sedang masuk..." : "Masuk"}
            </button>
          </form>

          {/* Toggle mobile */}
          <p className="sm:hidden text-[12.5px] text-muted mt-5 text-center">
            Perusahaan baru?{" "}
            <button
              onClick={() => setMode("signup")}
              className="text-botanical-700 font-medium hover:underline"
            >
              Daftar di sini
            </button>
          </p>
        </div>

        {/* ================= PANEL SIGN UP (kanan) ================= */}
        <div
          className={`p-8 sm:p-12 sm:absolute sm:inset-y-0 sm:right-0 sm:w-1/2 flex-col justify-center ${
            isSignup ? "flex" : "hidden sm:flex"
          }`}
          style={{
            transition: `opacity 500ms ${EASE}, transform 900ms ${EASE}`,
            opacity: isSignup ? 1 : 0,
            transform: isSignup ? "none" : "translateX(40px)",
            pointerEvents: isSignup ? "auto" : "none",
            filter: isSignup ? "none" : "blur(4px)",
          }}
        >
          {rSuccess ? (
            <div className="text-center sm:text-left">
              <div className="text-[38px] mb-3">🎉</div>
              <h1 className="font-display text-[24px] font-semibold text-ink mb-2">
                Pendaftaran Berhasil!
              </h1>
              <p className="text-muted text-[13.5px] leading-relaxed mb-6">
                Akun perusahaanmu sudah dibuat dan sedang{" "}
                <b>menunggu aktivasi</b> dari tim Seawise. Kamu akan bisa
                menggunakan aplikasi begitu perusahaanmu diaktifkan.
              </p>
              <button
                onClick={() => {
                  setMode("signin");
                  setRSuccess(false);
                }}
                className="bg-botanical-700 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all"
              >
                Kembali ke Masuk
              </button>
            </div>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-[0.15em] text-clay-600 font-semibold mb-1">
                Gabung sekarang
              </div>
              <h1 className="font-display text-[26px] font-semibold text-ink mb-1">
                Daftarkan Perusahaan
              </h1>
              <p className="text-muted text-[12.5px] mb-5">
                Gratis mendaftar — aktivasi dilakukan oleh tim Seawise.
              </p>

              <form onSubmit={handleRegister}>
                <label className={labelCls}>Nama Perusahaan</label>
                <input
                  required
                  value={rCompany}
                  onChange={(e) => setRCompany(e.target.value)}
                  className={`${inputCls} mb-3`}
                  placeholder="PT Maju Kosmetik Indonesia"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>Nama Lengkap</label>
                    <input
                      required
                      value={rNama}
                      onChange={(e) => setRNama(e.target.value)}
                      className={inputCls}
                      placeholder="Nama admin"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Email</label>
                    <input
                      type="email"
                      required
                      value={rEmail}
                      onChange={(e) => setREmail(e.target.value)}
                      className={inputCls}
                      placeholder="kamu@perusahaan.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className={labelCls}>Password</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={rPassword}
                      onChange={(e) => setRPassword(e.target.value)}
                      className={inputCls}
                      placeholder="Min. 6 karakter"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Konfirmasi</label>
                    <input
                      type="password"
                      required
                      value={rConfirm}
                      onChange={(e) => setRConfirm(e.target.value)}
                      className={inputCls}
                      placeholder="Ulangi password"
                    />
                  </div>
                </div>

                {rError && (
                  <p className="text-clay-600 text-[12.5px] mb-4">{rError}</p>
                )}

                <button
                  type="submit"
                  disabled={rLoading}
                  className="w-full bg-botanical-700 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-botanical-800 transition-all shadow-sm disabled:opacity-70 flex items-center justify-center gap-2"
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
            className="absolute inset-0 flex flex-col items-center justify-center text-center px-12"
            style={{
              transition: `opacity 450ms ${EASE}`,
              opacity: isSignup ? 0 : 1,
              pointerEvents: isSignup ? "none" : "auto",
            }}
          >
            <Logo size={40} />
            <h2 className="font-display text-[24px] font-semibold mt-4 mb-2">
              Perusahaan baru di sini?
            </h2>
            <p className="text-white/70 text-[13px] leading-relaxed mb-6 max-w-[280px]">
              Daftarkan perusahaanmu dan kelola stok, purchase order, hingga
              produksi dalam satu aplikasi.
            </p>
            <button
              onClick={() => setMode("signup")}
              className="border border-white/50 rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Daftarkan Perusahaan
            </button>
          </div>

          {/* Konten saat menutupi kiri (mode signup) */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center text-center px-12"
            style={{
              transition: `opacity 450ms ${EASE}`,
              opacity: isSignup ? 1 : 0,
              pointerEvents: isSignup ? "auto" : "none",
            }}
          >
            <Logo size={40} />
            <h2 className="font-display text-[24px] font-semibold mt-4 mb-2">
              Sudah jadi member?
            </h2>
            <p className="text-white/70 text-[13px] leading-relaxed mb-6 max-w-[280px]">
              Masuk dan lanjutkan pekerjaanmu dari tempat terakhir.
            </p>
            <button
              onClick={() => setMode("signin")}
              className="border border-white/50 rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-white/10 transition-colors"
            >
              Masuk
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
