"use client";

/* ============================================================
   Kotak isian angka dengan pemisah ribuan otomatis.

   Semua kolom angka di aplikasi ini memakainya. Jangan menulis
   `<input inputMode="decimal">` baru dari nol: yang dilihat user
   harus "1.500.000", sementara yang disimpan di state tetap
   "1500000" supaya `parseFloat` di pemanggil tidak perlu tahu
   apa-apa soal format.

   Kontraknya sengaja beda dengan <input> biasa:

     onChange={(nilai) => ...}   // bukan (e) => e.target.value

   `nilai` sudah bersih: cuma angka, titik desimal, dan minus.
   ============================================================ */

import { forwardRef } from "react";
import {
  hitungToken,
  intiAngka,
  keNilai,
  keTampilan,
  normalisasiTempel,
  PENANDA_DESIMAL,
  posisiSetelahToken,
} from "@/lib/angka";

type Props = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  /** NILAI, bukan tampilan: "1500.75" */
  value: string;
  /** dipanggil dengan NILAI yang sudah bersih */
  onChange: (nilai: string) => void;
  /** true = tanpa desimal (mis. qty pcs, tempo hari) */
  bulat?: boolean;
  /** true = boleh minus */
  negatif?: boolean;
};

const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  { value, onChange, bulat = false, negatif = false, ...rest },
  ref
) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const node = e.currentTarget;
    const ev = e.nativeEvent as InputEvent;
    const tampilLama = keTampilan(value);

    let mentah = node.value;
    let caret = node.selectionStart ?? mentah.length;

    // Pemisah yang BARU diketik selalu berarti desimal: titik yang
    // sudah ada di layar cuma pemisah ribuan yang kita sisipkan
    // sendiri. Tanpa penandaan ini "1.5" akan terbaca 15.
    if (!bulat && (ev.data === "." || ev.data === ",") && caret > 0) {
      mentah = mentah.slice(0, caret - 1) + PENANDA_DESIMAL + mentah.slice(caret);
    }

    // Tempelan diperiksa utuh: yang datang dari spreadsheet bisa memakai
    // titik sebagai desimal.
    if (!bulat && ev.inputType === "insertFromPaste") {
      const tempel = ev.dataTransfer?.getData("text") ?? ev.data ?? "";
      const awal = caret - tempel.length;
      if (tempel && awal >= 0) {
        const bersih = normalisasiTempel(tempel);
        mentah = mentah.slice(0, awal) + bersih + mentah.slice(caret);
        caret = awal + bersih.length;
      }
    }

    // Backspace/Delete yang cuma kena pemisah ribuan terasa seperti
    // tombolnya tidak berfungsi (angkanya utuh, titiknya muncul lagi).
    // Yang dimaksud user pasti angka di sebelahnya.
    if (intiAngka(mentah) === intiAngka(tampilLama)) {
      if (ev.inputType === "deleteContentBackward" && caret > 0) {
        mentah = mentah.slice(0, caret - 1) + mentah.slice(caret);
        caret -= 1;
      } else if (ev.inputType === "deleteContentForward") {
        mentah = mentah.slice(0, caret) + mentah.slice(caret + 1);
      }
    }

    const nilai = keNilai(mentah, { bulat, negatif });
    const tampil = keTampilan(nilai);
    const posisi = posisiSetelahToken(tampil, hitungToken(mentah.slice(0, caret)));

    // DOM disetel sendiri, bukan cuma lewat state: kalau `nilai` tidak
    // berubah (mis. user mengetik huruf) React tidak merender ulang,
    // dan kotaknya akan menyimpan karakter yang barusan kita buang.
    node.value = tampil;
    node.setSelectionRange(posisi, posisi);

    if (nilai !== value) onChange(nilai);
  }

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode={bulat ? "numeric" : "decimal"}
      value={keTampilan(value)}
      onChange={handleChange}
    />
  );
});

export default NumberInput;
