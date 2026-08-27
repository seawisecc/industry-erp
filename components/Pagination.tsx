"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useTransition } from "react";
import type { PageInfo } from "@/lib/pagination";

/**
 * Navigasi halaman tabel. Nomor halaman disimpan di URL supaya
 * bisa di-refresh / di-share, dan tombol Kembali browser bekerja.
 *
 * Bentuknya « ‹ [nomor] › » : panah tunggal geser satu halaman, panah
 * ganda lompat ke ujung. Kotak nomornya bisa diketik, karena pada daftar
 * ratusan halaman menekan "berikutnya" berpuluh kali bukan navigasi.
 */
export default function Pagination({ info }: { info: PageInfo }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (info.totalPages <= 1) return null;

  function goTo(page: number) {
    const tujuan = Math.min(Math.max(1, page), info.totalPages);
    if (tujuan === info.page) return;
    const sp = new URLSearchParams(params.toString());
    if (tujuan <= 1) sp.delete("page");
    else sp.set("page", String(tujuan));
    const qs = sp.toString();
    startTransition(() =>
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    );
  }

  /**
   * Angka yang diketik user. Hanya dijalankan oleh Enter, TIDAK oleh blur:
   * kalau blur ikut pindah halaman, mengetik nomor lalu mengklik panah
   * menghasilkan dua perpindahan yang saling menimpa (dan di Safari
   * tombol tidak menerima fokus, jadi kasusnya tidak bisa dideteksi lewat
   * relatedTarget). Meninggalkan kotaknya mengembalikan angka semula.
   */
  function terapkan(el: HTMLInputElement) {
    const n = parseInt(el.value.replace(/[^\d]/g, ""), 10);
    if (!n || n === info.page) {
      el.value = String(info.page); // ketikan setengah jadi dikembalikan
      return;
    }
    goTo(n);
  }

  const btn =
    "inline-flex items-center justify-center h-9 w-9 rounded-lg border border-line text-ink transition-colors hover:bg-white/50 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent";

  const diAwal = info.page <= 1 || pending;
  const diAkhir = info.page >= info.totalPages || pending;

  return (
    <div className="print-hide flex items-center justify-between gap-3 mt-3 flex-wrap">
      <span className="text-[12px] text-muted flex items-center gap-2">
        {pending && (
          <span className="inline-block w-3 h-3 border-2 border-botanical-700/30 border-t-botanical-700 rounded-full animate-spin" />
        )}
        Menampilkan {info.from.toLocaleString("id-ID")} s/d{" "}
        {info.to.toLocaleString("id-ID")} dari {info.total.toLocaleString("id-ID")}{" "}
        baris
      </span>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => goTo(1)}
          disabled={diAwal}
          className={btn}
          title="Halaman pertama"
          aria-label="Halaman pertama"
        >
          <ChevronsLeft size={16} />
        </button>
        <button
          type="button"
          onClick={() => goTo(info.page - 1)}
          disabled={diAwal}
          className={btn}
          title="Halaman sebelumnya"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="flex items-center gap-1.5 px-1 text-[12.5px] text-muted">
          {/* key: kotaknya dipasang ulang tiap kali halaman berubah, jadi
              isinya ikut angka baru tanpa perlu state bayangan yang
              disetel dari effect. */}
          <input
            key={info.page}
            defaultValue={info.page}
            inputMode="numeric"
            aria-label="Nomor halaman"
            title="Ketik nomor halaman lalu tekan Enter"
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                terapkan(e.currentTarget);
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                e.currentTarget.value = String(info.page);
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => {
              e.currentTarget.value = String(info.page);
            }}
            disabled={pending}
            style={{ width: `${String(info.totalPages).length + 2.5}ch` }}
            className="h-9 glass-input rounded-lg px-2 text-center text-[12.5px] font-medium text-ink focus:outline-none focus:ring-2 focus:ring-botanical-700 disabled:opacity-50"
          />
          <span className="whitespace-nowrap">
            dari {info.totalPages.toLocaleString("id-ID")}
          </span>
        </div>

        <button
          type="button"
          onClick={() => goTo(info.page + 1)}
          disabled={diAkhir}
          className={btn}
          title="Halaman berikutnya"
          aria-label="Halaman berikutnya"
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => goTo(info.totalPages)}
          disabled={diAkhir}
          className={btn}
          title="Halaman terakhir"
          aria-label="Halaman terakhir"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
