/* ============================================================
   Status "bisa dipasang?" sebagai external store.

   Tiga hal yang menentukan bentuk file ini, dan semuanya sudah
   jadi jebakan di aplikasi lain:

   1. `beforeinstallprompt` cuma DIPICU SEKALI, dan waktunya bisa
      lebih awal daripada hidrasi React. Pada kunjungan kedua,
      service worker sudah aktif dan manifest sudah di-cache
      browser, jadi Chrome memicunya nyaris bersamaan dengan
      parsing HTML. Listener yang baru dipasang di `useEffect`
      ketinggalan kereta dan tombolnya TIDAK PERNAH muncul, cuma
      pada sebagian pengguna, yaitu bug yang paling sulit
      dipercaya waktu dilaporkan. Karena itu penangkapnya skrip
      inline di `app/layout.tsx` yang jalan saat HTML diurai,
      dan file ini cuma membaca hasil tangkapannya.

   2. Event-nya harus DISIMPAN, bukan dipakai lalu dibuang.
      `prompt()` cuma boleh dipanggil dari gestur user, jadi
      objeknya ditahan di `window` sampai tombolnya ditekan.

   3. iOS Safari tidak punya `beforeinstallprompt` sama sekali,
      dan tidak akan pernah punya. Satu-satunya jalan pasang di
      sana adalah Bagikan lalu "Tambahkan ke Layar Utama", jadi
      yang bisa diberikan aplikasi cuma petunjuknya.

   Nilai snapshot-nya sengaja string, bukan objek: `useSyncExternal
   Store` menuntut nilai yang sama persis selama tidak ada
   perubahan, dan objek baru tiap panggilan bikin React me-render
   tanpa henti.
   ============================================================ */

export type StatusPasang =
  /** sudah dibuka sebagai aplikasi terpasang */
  | "terpasang"
  /** browser siap menampilkan dialog pasang bawaannya */
  | "siap"
  /** iOS: cuma bisa lewat petunjuk manual */
  | "ios"
  /** tidak bisa dipasang di browser ini */
  | "tidak-bisa";

/** Event yang ditangkap skrip inline. Tipe minimal, cukup untuk dipakai. */
type PromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    __pwaPrompt?: PromptEvent | null;
  }
}

/** Nama event kustom yang dikirim skrip inline, dipakai untuk berlangganan. */
export const PWA_EVENT = "pwa-status";

function terpasang(): boolean {
  if (typeof window === "undefined") return false;
  // iOS memakai flag miliknya sendiri, Chrome/Android lewat media query.
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return (
    iosStandalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

/** Safari di iPhone/iPad, termasuk iPadOS yang menyamar sebagai Mac. */
export function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ memakai UA Mac; pembedanya layar sentuh.
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  // Chrome & Firefox di iOS memakai WebKit tapi tidak punya menu
  // "Tambahkan ke Layar Utama", jadi petunjuknya cuma menyesatkan.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function statusPasang(): StatusPasang {
  if (typeof window === "undefined") return "tidak-bisa";
  if (terpasang()) return "terpasang";
  if (window.__pwaPrompt) return "siap";
  if (isIosSafari()) return "ios";
  return "tidak-bisa";
}

/** Server & hidrasi: belum ada yang bisa dibaca, jadi tombolnya belum ada. */
export function statusAwal(): StatusPasang {
  return "tidak-bisa";
}

export function langganiStatus(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia?.("(display-mode: standalone)");
  window.addEventListener(PWA_EVENT, cb);
  mq?.addEventListener("change", cb);
  return () => {
    window.removeEventListener(PWA_EVENT, cb);
    mq?.removeEventListener("change", cb);
  };
}

/**
 * Buka dialog pasang bawaan browser. Kembaliannya true kalau user
 * jadi memasang. Event-nya hangus sesudah dipakai, jadi langsung
 * dibuang dan store diberi tahu supaya tombolnya hilang.
 */
export async function mintaPasang(): Promise<boolean> {
  const ev = typeof window !== "undefined" ? window.__pwaPrompt : null;
  if (!ev) return false;
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === "accepted") {
      window.__pwaPrompt = null;
      window.dispatchEvent(new Event(PWA_EVENT));
      return true;
    }
    return false;
  } catch {
    // Dialog ditolak browser (mis. dipanggil di luar gestur user).
    return false;
  }
}
