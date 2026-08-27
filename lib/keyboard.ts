/* ============================================================
   Navigasi keyboard. Berkas ini BERSIH dari import server
   (lihat bab "Batas server/klien di lib/" di CLAUDE.md), jadi
   boleh dipakai komponen "use client" mana pun.
   ============================================================ */

export type ArgsCombo = {
  /** jumlah saran yang sedang dirender */
  jumlah: number;
  sorot: number;
  setSorot: (n: number) => void;
  buka: boolean;
  setBuka: (b: boolean) => void;
  /** dipanggil dengan indeks saran yang dipilih */
  pilih: (i: number) => void;
};

/**
 * Panah atas/bawah, Enter, dan Esc untuk daftar saran ketik-cari.
 *
 * Dipasang di INPUT-nya, bukan di tombol sarannya: tombol saran
 * diberi `tabIndex={-1}` supaya Tab melewati seluruh daftar (tanpa
 * itu Tab harus ditekan 30 kali untuk keluar dari satu pemilih).
 *
 * Semua tombol yang ditangani memanggil `preventDefault`, dan itu
 * yang dibaca `enterKeFieldBerikutnya` supaya Enter di sini tidak
 * ikut memindahkan fokus ke kolom berikutnya.
 */
export function tombolCombo(
  e: React.KeyboardEvent<HTMLInputElement>,
  a: ArgsCombo
): void {
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!a.buka) {
      a.setBuka(true);
      a.setSorot(0);
      return;
    }
    if (a.jumlah === 0) return;
    const arah = e.key === "ArrowDown" ? 1 : -1;
    const next = (a.sorot + arah + a.jumlah) % a.jumlah;
    a.setSorot(next);
    gulirKeSorotan();
    return;
  }

  if (e.key === "Enter") {
    if (!a.buka || a.jumlah === 0) return;
    e.preventDefault();
    a.pilih(Math.min(a.sorot, a.jumlah - 1));
    return;
  }

  if (e.key === "Escape") {
    if (!a.buka) return;
    e.preventDefault();
    e.stopPropagation(); // jangan sampai ikut menutup dialog di belakangnya
    a.setBuka(false);
    return;
  }

  if (e.key === "Tab") {
    a.setBuka(false);
  }
}

/** Saran tersorot digulirkan ke dalam pandangan sesudah React merender. */
function gulirKeSorotan() {
  requestAnimationFrame(() => {
    document
      .querySelector('[data-sorot="true"]')
      ?.scrollIntoView({ block: "nearest" });
  });
}

/** Kelas latar untuk saran yang sedang tersorot panah. */
export function klasSorot(aktif: boolean) {
  return aktif ? "bg-botanical-100" : "hover:bg-white/60";
}

/**
 * Enter di kolom isian = pindah ke kolom berikutnya, bukan menyimpan
 * dokumen. Dipasang di <form> yang punya tabel item (PO, Invoice,
 * Konsinyasi, Receiving), tempat orang mengetik puluhan angka
 * berurutan dan Enter yang menyimpan dokumen setengah jadi mahal.
 *
 * Textarea tidak disentuh (Enter di situ = baris baru), begitu juga
 * saat combobox sudah menangani Enter-nya sendiri.
 */
export function enterKeFieldBerikutnya(e: React.KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.defaultPrevented) return; // combobox sudah memakainya

  const t = e.target as HTMLElement;
  if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLSelectElement)) return;
  if (t instanceof HTMLInputElement) {
    const tipe = t.type;
    if (tipe === "checkbox" || tipe === "radio" || tipe === "submit" || tipe === "button")
      return;
  }

  const form = e.currentTarget;
  const bisaDifokus = Array.from(
    form.querySelectorAll<HTMLElement>("input, select, textarea, button[type='submit']")
  ).filter((el) => {
    if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
    if (el instanceof HTMLInputElement && el.type === "hidden") return false;
    if (el.tabIndex < 0) return false;
    // tersembunyi (mis. kartu HP vs tabel desktop) tidak boleh dituju
    return el.offsetParent !== null || el === document.activeElement;
  });

  const i = bisaDifokus.indexOf(t);
  if (i === -1) return;

  e.preventDefault();
  const next = bisaDifokus[i + 1];
  if (!next) return;
  next.focus();
  if (next instanceof HTMLInputElement && next.type !== "date") next.select();
}
