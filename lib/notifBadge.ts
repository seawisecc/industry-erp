/* ============================================================
   Store klien untuk badge menu Notifications.

   Dibaca lewat useSyncExternalStore (lihat bab State klien di
   CLAUDE.md): angkanya tidak ada di server, jadi server & hidrasi
   melihat `null` (badge tidak dirender) lalu klien berpindah ke angka
   sebenarnya tanpa dianggap bentrok, dan tanpa setState di effect.

   Pengambilannya cuma jalan selama ada komponen yang berlangganan
   (sidebar desktop dan bar bawah HP), dan dua-duanya berbagi SATU
   store, jadi satu tab membuat satu permintaan, bukan dua.

   Kapan diambil ulang:
   - tiap INTERVAL_MS selama tab terbuka;
   - saat tab kembali difokus;
   - saat pindah halaman (`segarkan`, dipanggil sidebar), dibatasi
     JEDA_MIN_MS supaya klik beruntun tidak jadi rentetan query.
   Menyetujui PO atau meluluskan QC hampir selalu diikuti pindah
   halaman, jadi badge ikut turun tanpa harus menunggu interval.

   File ini bersih dari import server.
   ============================================================ */

export type NotifBadge = {
  total: number;
  /** Ada item berurgensi kritis, badge-nya merah */
  kritis: boolean;
  /** Salah satu kelompok terpotong di batas ambil, angkanya minimal segitu */
  terpotong: boolean;
};

const INTERVAL_MS = 3 * 60_000;
const JEDA_MIN_MS = 30_000;

let nilai: NotifBadge | null = null;
let terakhir = 0;
let sedang = false;
let timer: ReturnType<typeof setInterval> | null = null;
const pendengar = new Set<() => void>();

async function ambil() {
  if (sedang) return;
  sedang = true;
  terakhir = Date.now();
  try {
    const res = await fetch("/api/notif-count", { cache: "no-store" });
    // Sesi habis membuat proxy mengembalikan redirect ke /login (HTML),
    // bukan JSON. Badge lama dibiarkan, bukan dihapus atau dibuat nol.
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return;
    const d = (await res.json()) as NotifBadge;
    const baru: NotifBadge = {
      total: Number(d.total) || 0,
      kritis: !!d.kritis,
      terpotong: !!d.terpotong,
    };
    // Objek baru cuma kalau isinya berubah: useSyncExternalStore
    // me-render ulang tiap kali referensinya berganti.
    if (
      !nilai ||
      nilai.total !== baru.total ||
      nilai.kritis !== baru.kritis ||
      nilai.terpotong !== baru.terpotong
    ) {
      nilai = baru;
      pendengar.forEach((f) => f());
    }
  } catch {
    // Koneksi putus: badge lama tetap tampil, dicoba lagi di putaran berikutnya
  } finally {
    sedang = false;
  }
}

function saatFokus() {
  if (document.visibilityState === "visible") segarkan();
}

/** Ambil ulang kalau sudah lewat jeda minimum sejak pengambilan terakhir. */
export function segarkan() {
  if (Date.now() - terakhir >= JEDA_MIN_MS) void ambil();
}

export function langganan(f: () => void) {
  pendengar.add(f);
  if (pendengar.size === 1) {
    segarkan();
    timer = setInterval(() => void ambil(), INTERVAL_MS);
    document.addEventListener("visibilitychange", saatFokus);
  }
  return () => {
    pendengar.delete(f);
    if (pendengar.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", saatFokus);
    }
  };
}

export function snapshot(): NotifBadge | null {
  return nilai;
}

export function snapshotServer(): NotifBadge | null {
  return null;
}

/** Teks di badge: "99+" supaya pil tetap kecil. */
export function teksBadge(b: NotifBadge): string {
  if (b.total > 99) return "99+";
  return b.terpotong ? `${b.total}+` : String(b.total);
}
