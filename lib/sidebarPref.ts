/* ============================================================
   Preferensi lebar sidebar, disimpan di COOKIE bukan localStorage.

   Ini perbaikan known issue lama. Dulu preferensinya di localStorage,
   yang tidak ada di server, jadi HTML pertama SELALU dirender lebar
   lalu dikoreksi di klien. `useSyncExternalStore` menghapus bentrok
   hidrasinya, tapi tidak menghapus kedipannya: tiap kali pindah
   halaman, sidebar melebar sekejap sebelum menyempit lagi.

   Cookie ikut terkirim di tiap request, jadi server bisa merender
   lebar yang benar sejak byte pertama dan kedipannya hilang sama
   sekali.

   Berkas ini sengaja bersih dari import server: nilainya dibaca di
   `components/Sidebar.tsx` (server) dan ditulis di `SidebarNav`
   (klien), jadi keduanya harus bisa mengimpor nama yang sama.
   ============================================================ */

export const SIDEBAR_COOKIE = "sidebar-rail";

/** Setahun. Preferensi tampilan, tidak ada alasan kedaluwarsa cepat. */
const UMUR_DETIK = 60 * 60 * 24 * 365;

/** Kunci localStorage versi lama, disapu sekali lalu tidak dipakai lagi. */
export const SIDEBAR_KEY_LAMA = "sidebar-collapsed";

/** true = sidebar tampil sebagai rail ikon. */
export function bacaRail(nilaiCookie: string | undefined): boolean {
  return nilaiCookie === "1";
}

/** Ditulis dari klien. `SameSite=Lax` sudah cukup: isinya cuma preferensi. */
export function tulisRail(rail: boolean) {
  try {
    document.cookie = `${SIDEBAR_COOKIE}=${rail ? "1" : "0"}; path=/; max-age=${UMUR_DETIK}; SameSite=Lax`;
  } catch {
    // Cookie diblokir: sidebar tetap jalan, cuma tidak diingat.
  }
}
