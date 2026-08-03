/* ============================================================
   Helper tanggal KALENDER (yyyy-mm-dd).

   Server produksi (Vercel) berjalan di UTC, bukan waktu Indonesia.
   Jadi `new Date().toLocaleDateString("sv-SE")` di server menghasilkan
   tanggal UTC: setiap transaksi antara 00:00-08:00 WITA akan tercatat
   di tanggal KEMARIN. Untuk ERP yang dokumennya diaudit, itu fatal.

   Semua tanggal "hari ini" di sisi server WAJIB lewat localDateStr()
   supaya dihitung eksplisit di zona operasional, tidak ikut zona server.

   Di komponen client ("use client") hal ini tidak berlaku — di sana
   `new Date()` sudah memakai zona browser user, yang memang benar.
   ============================================================ */

// Bisa dioverride lewat env kalau perusahaan beroperasi di zona lain
// (mis. APP_TIMEZONE=Asia/Jakarta untuk WIB).
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Makassar";

const calendarFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Tanggal kalender di zona operasional, format yyyy-mm-dd. */
export function localDateStr(d: Date = new Date()): string {
  const parts = calendarFmt.formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Kunci bulan yyyy-mm di zona operasional. */
export function localMonthKey(d: Date = new Date()): string {
  return localDateStr(d).slice(0, 7);
}

/**
 * Geser tanggal kalender sekian hari. Murni aritmatika kalender
 * (dihitung di UTC supaya tidak kena pergeseran zona sama sekali),
 * masuk yyyy-mm-dd keluar yyyy-mm-dd.
 */
export function addDaysStr(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
