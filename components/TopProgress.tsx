"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Progress bar tipis di atas layar — langsung muncul begitu link internal
 * diklik, hilang begitu halaman tujuan selesai render. Feedback instan
 * tanpa library tambahan.
 */
export default function TopProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  // Navigasi selesai (pathname berubah) → sembunyikan bar
  useEffect(() => {
    setActive(false);
  }, [pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Abaikan klik dengan modifier (buka tab baru, dsb.)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
        return;
      const target = e.target as HTMLElement | null;
      const a = target?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/")) return;
      if (a.target && a.target !== "_self") return;
      // Klik ke halaman yang sama → tidak perlu bar
      const url = new URL(href, window.location.origin);
      if (url.pathname === window.location.pathname) return;
      setActive(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (!active) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] h-[3px] pointer-events-none">
      <div className="h-full bg-botanical-700 topbar-progress rounded-r-full" />
    </div>
  );
}
