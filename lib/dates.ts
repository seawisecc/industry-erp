// Helper tanggal LOKAL — jangan pakai toISOString() untuk tanggal kalender!
// toISOString() mengonversi ke UTC, sehingga di zona UTC+8 tanggal bisa
// mundur satu hari (mis. 1 Juli 00:00 WITA → "2026-06-30").

export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function localMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addDaysStr(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}
