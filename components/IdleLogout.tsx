"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const IDLE_MINUTES = 30;
const WARN_SECONDS = 60; // hitung mundur sebelum benar-benar keluar

/**
 * Auto sign-out setelah tidak ada aktivitas selama IDLE_MINUTES.
 * Aktivitas = klik, ketik, scroll, sentuh, gerak mouse.
 *
 * Satu menit terakhir user diberi peringatan + tombol "Tetap Masuk".
 * Tanpa ini, operator yang sedang mengawasi proses produksi (mixer
 * jalan, tangan tidak di layar) bisa ter-logout diam-diam dan
 * kehilangan isian batch record yang belum tersimpan.
 */
export default function IdleLogout() {
  const [warning, setWarning] = useState(false);
  const [sisa, setSisa] = useState(WARN_SECONDS);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (tick.current) clearInterval(tick.current);
    warnTimer.current = null;
    tick.current = null;
  }, []);

  const signOut = useCallback(async () => {
    clearTimers();
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }, [clearTimers]);

  // Jadwalkan ulang hitungan idle. Sengaja TIDAK memanggil setState
  // supaya aman dipanggil dari effect maupun listener.
  const startCountdown = useCallback(() => {
    clearTimers();
    warnTimer.current = setTimeout(
      () => {
        setWarning(true);
        let n = WARN_SECONDS;
        setSisa(n);
        tick.current = setInterval(() => {
          n -= 1;
          setSisa(n);
          if (n <= 0) void signOut();
        }, 1000);
      },
      (IDLE_MINUTES * 60 - WARN_SECONDS) * 1000
    );
  }, [clearTimers, signOut]);

  const stayLoggedIn = useCallback(() => {
    setWarning(false);
    setSisa(WARN_SECONDS);
    startCountdown();
  }, [startCountdown]);

  // Hitungan berjalan sejak halaman dibuka
  useEffect(() => {
    startCountdown();
    return clearTimers;
  }, [startCountdown, clearTimers]);

  // Listener aktivitas. Saat peringatan tampil listener dilepas: user
  // harus menekan tombol, supaya peringatannya benar-benar terbaca dan
  // tidak hilang cuma karena mouse tersenggol.
  useEffect(() => {
    if (warning) return;

    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last < 1000) return; // throttle: mousemove bisa ratusan/detik
      last = now;
      startCountdown();
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
    events.forEach((e) =>
      window.addEventListener(e, onActivity, { passive: true })
    );
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
  }, [warning, startCountdown]);

  if (!warning) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-botanical-900/50 backdrop-blur-[2px]">
      <div className="glass rounded-2xl p-6 sm:p-8 max-w-sm text-center">
        <h2 className="font-display text-[18px] font-semibold text-ink mb-2">
          Masih di sana?
        </h2>
        <p className="text-muted text-[13px] leading-relaxed mb-5">
          Kamu akan otomatis keluar dalam <b>{Math.max(0, sisa)} detik</b> karena
          tidak ada aktivitas. Isian yang belum disimpan bisa hilang.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={stayLoggedIn}
            className="bg-botanical-700 text-white text-[13.5px] font-medium px-5 py-2.5 rounded-lg hover:bg-botanical-800 transition-colors"
          >
            Tetap Masuk
          </button>
          <button
            onClick={() => void signOut()}
            className="border border-line text-muted text-[13.5px] font-medium px-5 py-2.5 rounded-lg hover:text-ink transition-colors"
          >
            Keluar Sekarang
          </button>
        </div>
      </div>
    </div>
  );
}
