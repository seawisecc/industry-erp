/* ============================================================
   Angka di kolom isian: pemisah ribuan otomatis.

   Berkas ini BERSIH dari import server (lihat bab "Batas
   server/klien di lib/" di CLAUDE.md), jadi boleh dipakai
   komponen "use client" mana pun.

   Dua bentuk yang harus dibedakan, dan tidak boleh tertukar:

   | Bentuk   | Contoh     | Dipakai di                     |
   | -------- | ---------- | ------------------------------ |
   | NILAI    | `1500.75`  | state React, payload ke server |
   | TAMPILAN | `1.500,75` | yang dilihat & diketik user    |

   NILAI memakai titik desimal supaya `parseFloat` / `Number` di
   pemanggil tetap jalan apa adanya. Yang berubah cuma yang dilihat
   orang.
   ============================================================ */

/**
 * Penanda sementara untuk pemisah desimal yang BARU diketik.
 * Titik di layar sudah dipakai sebagai pemisah ribuan, jadi titik
 * yang baru ditekan orang harus ditandai dulu sebelum sisa titik
 * pemisah ribuannya dibuang.
 */
export const PENANDA_DESIMAL = "\u0001";

export type OpsiAngka = {
  /** true = tanpa desimal sama sekali (mis. qty pcs, tempo hari) */
  bulat?: boolean;
  /** true = boleh minus (mis. selisih) */
  negatif?: boolean;
};

/** `1500.75` jadi `1.500,75`. String kosong tetap kosong. */
export function keTampilan(nilai: string): string {
  if (!nilai) return "";

  const minus = nilai.startsWith("-");
  const sisa = minus ? nilai.slice(1) : nilai;

  const iTitik = sisa.indexOf(".");
  const bulat = iTitik === -1 ? sisa : sisa.slice(0, iTitik);
  const desimal = iTitik === -1 ? null : sisa.slice(iTitik + 1);

  let out = kelompokRibuan(bulat);
  if (desimal !== null) out += "," + desimal;
  return (minus ? "-" : "") + out;
}

/**
 * Apa pun yang ada di kotak isian jadi NILAI yang bisa di-`parseFloat`.
 *
 * Titik dianggap pemisah ribuan dan dibuang; yang jadi desimal cuma
 * koma dan `PENANDA_DESIMAL`. Karena itu titik yang baru diketik user
 * harus ditukar jadi penanda LEBIH DULU oleh pemanggilnya, kalau tidak
 * "1.5" akan terbaca 15.
 */
export function keNilai(mentah: string, opsi: OpsiAngka = {}): string {
  const bolehDesimal = !opsi.bulat;
  const bolehMinus = !!opsi.negatif;

  let hasil = "";
  let adaDesimal = false;

  for (const c of mentah) {
    if (c >= "0" && c <= "9") {
      hasil += c;
      continue;
    }
    if (c === "," || c === PENANDA_DESIMAL) {
      if (!bolehDesimal || adaDesimal) continue;
      adaDesimal = true;
      hasil += ".";
      continue;
    }
    if (c === "-") {
      // minus cuma berlaku di paling depan
      if (!bolehMinus || hasil !== "") continue;
      hasil = "-";
      continue;
    }
    // titik = pemisah ribuan, tidak ikut
  }

  // "007" jadi "7", tapi "0" dan "0.5" dibiarkan
  return hasil.replace(/^(-?)0+(?=\d)/, "$1");
}

/**
 * Jumlah karakter yang "berarti": angka, pemisah desimal, dan minus.
 * Pemisah ribuan TIDAK dihitung karena dia disisipkan ulang tiap
 * ketikan. Ini yang dipakai untuk memulihkan posisi kursor supaya
 * mengetik di tengah "1.500.000" tidak melempar kursor ke ujung.
 */
export function hitungToken(s: string): number {
  let n = 0;
  for (const c of s) {
    if ((c >= "0" && c <= "9") || c === "," || c === "-" || c === PENANDA_DESIMAL) n++;
  }
  return n;
}

/** Indeks di string TAMPILAN tepat sesudah token ke-`n`. */
export function posisiSetelahToken(tampilan: string, n: number): number {
  if (n <= 0) return 0;
  let hitung = 0;
  for (let i = 0; i < tampilan.length; i++) {
    const c = tampilan[i];
    if ((c >= "0" && c <= "9") || c === "," || c === "-") hitung++;
    if (hitung === n) return i + 1;
  }
  return tampilan.length;
}

/**
 * Teks yang DITEMPEL boleh datang dari mana saja, termasuk spreadsheet
 * yang memakai titik sebagai desimal. Titik yang tidak diikuti TEPAT tiga
 * angka tidak mungkin pemisah ribuan, jadi itu desimal: "1500.75" jadi
 * 1500,75 sementara "1.500.000" tetap 1.500.000.
 *
 * Aturan ini cuma untuk tempelan. Waktu diketik, titik pemisah ribuan
 * sempat berpasangan dengan kurang dari tiga angka ("1.500" yang angka
 * 5-nya baru dihapus jadi "1.00"), dan menebaknya di situ akan mengubah
 * 100 jadi 1.
 */
export function normalisasiTempel(teks: string): string {
  return teks.replace(/\.(?!\d{3}(?!\d))/g, PENANDA_DESIMAL);
}

/** Angka dan pemisah desimal saja, untuk membandingkan dua isian. */
export function intiAngka(s: string): string {
  return s.replace(/[^\d,]/g, "");
}

function kelompokRibuan(digit: string): string {
  return digit.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
