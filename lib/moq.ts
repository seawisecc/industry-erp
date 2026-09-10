/* ============================================================
   MOQ: pembulatan dan pemeriksaannya, satu tempat.

   Aturannya cuma satu kalimat, "qty pesan harus minimal MOQ dan
   kelipatannya", tapi dia hidup di LIMA layar: PPIC Planner, Guide
   Order (saran qty sekaligus penjaganya), validasi `createPO` di
   server, dan simulasi produksi di R&D.

   Sebelum file ini ada, rumusnya disalin di tiap tempat. Yang
   berbahaya bukan barisnya panjang, melainkan `- 1e-9` di dalamnya:
   toleransi galat float itu gampang ikut hilang waktu disalin, dan
   tanpanya `Math.ceil(25 / 25)` untuk angka hasil hitungan desimal
   bisa jadi 2, sehingga PO terbit dua kali lipat dari yang dimaui.
   Pelajarannya sama dengan `invoice_tax_calc` dan `fg_stock_calc`:
   salinan berikutnya adalah cara paling pasti membuat dua layar
   menyebut angka yang berbeda untuk pertanyaan yang sama.

   File ini bersih dari import server, jadi penjaga di layar dan
   penjaga di server action memakai fungsi yang sama persis. Kalau
   tidak, form bisa mengizinkan qty yang ditolak server, atau
   sebaliknya menolak qty yang sebenarnya sah.
   ============================================================ */

/**
 * Toleransi galat pembulatan float, bukan kelonggaran MOQ.
 *
 * Kebutuhan bahan lahir dari perkalian persen (mis. 2,5% x 37,5 kg),
 * jadi hasilnya sering berupa angka seperti 24,999999999999996. Tanpa
 * toleransi, angka itu dibulatkan ke atas jadi dua kali MOQ.
 */
const TOLERANSI = 1e-9;

/** true = MOQ-nya benar-benar berlaku (terisi dan lebih dari nol). */
export function adaMoq(moq: number | null | undefined): moq is number {
  return moq != null && moq > 0;
}

/**
 * Qty yang harus dipesan supaya menutupi `kurang` sekaligus memenuhi
 * MOQ. Tanpa MOQ, angkanya dikembalikan apa adanya.
 */
export function bulatkanMoq(kurang: number, moq: number | null | undefined): number {
  if (!adaMoq(moq) || !(kurang > 0)) return kurang;
  return Math.ceil(kurang / moq - TOLERANSI) * moq;
}

/**
 * Alasan kenapa satu qty melanggar MOQ, atau null kalau sah.
 *
 * Mengembalikan alasannya, bukan boolean, karena dua pelanggarannya
 * butuh kalimat yang berbeda: "belum sampai minimum" dan "bukan
 * kelipatan" adalah kesalahan yang diperbaiki dengan cara berbeda.
 */
export type MoqLanggar = { jenis: "minimum" | "kelipatan"; moq: number };

export function periksaMoq(
  qty: number,
  moq: number | null | undefined
): MoqLanggar | null {
  if (!adaMoq(moq) || !(qty > 0)) return null;
  if (qty < moq) return { jenis: "minimum", moq };
  const rasio = qty / moq;
  if (Math.abs(rasio - Math.round(rasio)) > TOLERANSI) {
    return { jenis: "kelipatan", moq };
  }
  return null;
}
