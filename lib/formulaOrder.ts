/* ============================================================
   Urutan baku baris formula.

   Operator menimbang per fase: semua bahan Fase A dulu sampai
   habis, baru Fase B. Di dalam satu fase, bahan dengan persentase
   terbesar ditimbang lebih dulu karena itu yang menentukan massa
   batch, sisa kecil menyusul.

   Urutan ini harus SAMA di tiga tempat: detail produk (acuan
   formula), layar penimbangan di eksekusi produksi, dan Batch
   Record yang dicetak. Kalau ketiganya beda, operator harus
   mencocokkan baris satu per satu. Makanya logikanya di sini,
   bukan disalin ke tiap halaman.
   ============================================================ */

/** Bentuk minimum satu baris formula yang bisa diurutkan. */
export type FormulaRow = {
  fase?: string | null;
  percentage: number;
};

/** Kunci fase yang dinormalisasi: dipangkas, huruf besar, kosong jadi "-". */
export function faseKey(fase: string | null | undefined): string {
  const f = (fase ?? "").trim().toUpperCase();
  return f === "" ? "-" : f;
}

/** Label fase untuk ditampilkan: "Fase A", atau "Tanpa Fase". */
export function faseLabel(key: string): string {
  return key === "-" ? "Tanpa Fase" : `Fase ${key}`;
}

/**
 * Pembanding dua baris formula.
 *
 * Fase naik (A, B, C...), bahan tanpa fase selalu paling akhir.
 * Di dalam satu fase, persentase terbesar lebih dulu.
 */
export function bandingkanFormula(a: FormulaRow, b: FormulaRow): number {
  const fa = faseKey(a.fase);
  const fb = faseKey(b.fase);
  if (fa !== fb) {
    // "-" tidak boleh ikut diurut alfabetis, dia selalu di belakang
    if (fa === "-") return 1;
    if (fb === "-") return -1;
    return fa.localeCompare(fb);
  }
  return Number(b.percentage) - Number(a.percentage);
}

/** Salinan `rows` dalam urutan baku. Array aslinya tidak disentuh. */
export function urutkanFormula<T extends FormulaRow>(rows: readonly T[]): T[] {
  return [...rows].sort(bandingkanFormula);
}

export type FaseGroup<T> = {
  /** kunci hasil `faseKey` */
  fase: string;
  /** "Fase A" / "Tanpa Fase" */
  label: string;
  rows: T[];
  /** jumlah persentase seluruh baris di kelompok ini */
  total: number;
};

/**
 * Kelompokkan baris YANG SUDAH TERSORTIR jadi blok per fase.
 * Dipakai untuk baris pemisah "Fase A · 3 bahan" di tabel.
 */
export function kelompokkanFase<T extends FormulaRow>(
  rowsTersortir: readonly T[]
): FaseGroup<T>[] {
  const groups: FaseGroup<T>[] = [];
  for (const r of rowsTersortir) {
    const key = faseKey(r.fase);
    const last = groups[groups.length - 1];
    if (last && last.fase === key) {
      last.rows.push(r);
      last.total += Number(r.percentage);
    } else {
      groups.push({
        fase: key,
        label: faseLabel(key),
        rows: [r],
        total: Number(r.percentage),
      });
    }
  }
  return groups;
}
