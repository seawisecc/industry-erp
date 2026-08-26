// Service worker: syarat terakhir supaya Chrome memunculkan tombol Install,
// sekaligus penyedia layar "offline" yang layak.
//
// SENGAJA TIDAK MENYIMPAN HALAMAN APA PUN DI CACHE. Ini ERP multi-company
// dengan data per organisasi di balik login: halaman yang tersimpan di disk
// akan terbaca lagi oleh orang berikutnya yang memakai komputer yang sama,
// dan angka stok yang basi lebih berbahaya daripada layar kosong. Yang
// di-cache cuma dua golongan yang aman:
//
//   - /_next/static/*  aset ber-hash, isinya tidak pernah berubah untuk URL
//                      yang sama, jadi cache-first tidak bisa jadi basi.
//   - /offline.html    halaman statis tanpa data.
//
// Sisanya lewat begitu saja ke jaringan.

const VERSI = "v1";
const CACHE_STATIC = `static-${VERSI}`;
const CACHE_SHELL = `shell-${VERSI}`;
const HALAMAN_OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll([HALAMAN_OFFLINE, "/icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nama) =>
        Promise.all(
          nama
            .filter((n) => n !== CACHE_STATIC && n !== CACHE_SHELL)
            .map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Server action, login, dan seluruh mutasi lain wajib lewat apa adanya.
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase dan font Google

  // Navigasi: selalu ke jaringan. Hasilnya tidak disimpan, cuma diberi
  // jaring pengaman kalau perangkatnya benar-benar tidak punya koneksi.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(HALAMAN_OFFLINE, { ignoreSearch: true })
      )
    );
    return;
  }

  // Aset ber-hash: aman cache-first, dan inilah yang membuat aplikasi
  // terpasang terasa langsung terbuka.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const salinan = res.clone();
              caches.open(CACHE_STATIC).then((cache) => cache.put(req, salinan));
            }
            return res;
          })
      )
    );
  }
});
