"use client";

/* ============================================================
   Shortcut yang berlaku di seluruh aplikasi. Dipasang sekali di
   app/(app)/layout.tsx, tidak merender apa pun.

   / ............. lompat ke kotak pencarian halaman daftar
   Ctrl/Cmd + S .. simpan form yang sedang dibuka
   ============================================================ */

import { useEffect } from "react";

/** Sedang mengetik? Kalau ya, "/" adalah karakter biasa. */
function sedangMengetik(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return el.type !== "checkbox" && el.type !== "radio";
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

export default function KeyboardShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ---- Ctrl/Cmd + S: simpan ----
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        // Form yang dituju: yang sedang dipakai, kalau tidak ada ambil
        // form pertama di halaman. Halaman daftar tidak punya form
        // penyimpan data, jadi di sana biarkan browser yang menangani.
        const aktif = document.activeElement;
        const form =
          (aktif instanceof HTMLElement ? aktif.closest("form") : null) ||
          document.querySelector<HTMLFormElement>("form[data-simpan]") ||
          document.querySelector<HTMLFormElement>("main form");
        if (!form) return;
        e.preventDefault();
        // requestSubmit, bukan submit(): validasi bawaan browser dan
        // handler onSubmit (termasuk dialog konfirmasi) tetap jalan.
        form.requestSubmit();
        return;
      }

      // ---- / : cari ----
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (sedangMengetik(document.activeElement)) return;
        const cari = document.querySelector<HTMLInputElement>("[data-cari-tabel]");
        if (!cari) return;
        e.preventDefault();
        cari.focus();
        cari.select();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
