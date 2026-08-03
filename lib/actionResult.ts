/* ============================================================
   Hasil server action.

   PENTING — jangan melempar Error dari server action untuk pesan
   yang perlu dibaca user. Di build production React MENGGANTI pesan
   Error yang dilempar dari server dengan teks generik:

     "An error occurred in the Server Components render. The specific
      message is omitted in production builds to avoid leaking
      sensitive details."

   Jadi pesan validasi seperti "Qty masuk melebihi sisa PO" hilang
   dan user cuma lihat kalimat Inggris yang tidak berarti. Di dev
   pesannya masih utuh, jadi bug ini gampang lolos.

   Solusinya: kembalikan pesan sebagai NILAI, bukan dilempar.
   ============================================================ */

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Jalankan body server action dan ubah Error yang dilempar jadi
 * hasil yang aman dibaca client. Body-nya tetap boleh pakai
 * `throw new Error("...")` seperti biasa — validasi jadi tetap
 * rapi dan datar, tanpa perlu dibungkus try/catch satu per satu.
 */
export async function toResult(
  fn: () => Promise<unknown>,
  fallback = "Gagal menyimpan"
): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : fallback };
  }
}
