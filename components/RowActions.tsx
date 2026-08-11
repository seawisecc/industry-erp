/* ============================================================
   Aksi per baris tabel, icon button, bukan tombol teks.

   Kenapa ikon: kolom aksi dulu berisi "Edit / Cetak / Detail /
   Batal" sebagai teks. Di tabel dengan 8 kolom itu memakan lebar
   yang seharusnya jadi jatah data, dan di HP mendorong tabel makin
   panjang ke kanan. Ikon memakai lebar tetap, jadi kolom aksi tidak
   ikut melebar ketika labelnya berubah ("Edit" vs "Batch Record").

   Yang tidak boleh hilang bersama teksnya adalah keterbacaan
   maksudnya, maka tiap ikon wajib punya `label`: dipakai sekaligus
   sebagai aria-label (screen reader) dan isi tooltip (hover/fokus).

   Tooltip sengaja muncul di KIRI tombol. Pembungkus tabel memakai
   overflow-x-auto; per spesifikasi CSS itu membuat sumbu Y ikut
   jadi `auto`, sehingga tooltip di atas/bawah tombol terpotong.
   Di kiri, tooltip tetap berada di dalam tinggi baris.

   File ini sengaja TIDAK "use client" supaya bisa dipakai baik dari
   server component (halaman list) maupun client component
   (mis. CancelTxButton). Isinya murni presentasional.
   ============================================================ */

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

/** Bentuk minimal ikon lucide-react yang kita pakai. */
type IconType = ComponentType<{ size?: number | string; strokeWidth?: number }>;

export type ActionTone = "default" | "primary" | "danger";

const TONE: Record<ActionTone, string> = {
  default: "text-muted hover:text-ink hover:bg-white/70",
  primary: "text-botanical-700 hover:bg-botanical-100/80",
  danger: "text-clay-600 hover:bg-clay-100/70",
};

/**
 * Kelas tombol ikon. Target sentuh 40px di HP (rekomendasi WCAG 2.5.8
 * minimal 24px, tapi kartu di HP dipakai sambil berdiri di gudang),
 * mengecil jadi 32px di tabel desktop supaya tinggi baris tidak naik.
 */
export function iconActionClass(tone: ActionTone = "default", disabled = false) {
  return [
    "inline-flex items-center justify-center rounded-lg transition-colors",
    "h-10 w-10 md:h-8 md:w-8",
    disabled ? "text-muted/40 cursor-not-allowed" : TONE[tone],
  ].join(" ");
}

/** Balon tooltip. Dipakai bersama <ActionTip>. */
export function tipClass() {
  return [
    "pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-1",
    "z-20 hidden md:block whitespace-nowrap rounded-md",
    "bg-botanical-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg",
    "opacity-0 transition-opacity duration-100",
    "group-hover/act:opacity-100 group-focus-within/act:opacity-100",
  ].join(" ");
}

/**
 * Pembungkus satu aksi + tooltipnya. Dipakai langsung kalau
 * tombolnya bukan Link/button biasa (mis. trigger modal di
 * CancelTxButton).
 */
export function ActionTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="group/act relative inline-flex">
      {children}
      <span role="tooltip" className={tipClass()}>
        {label}
      </span>
    </span>
  );
}

/**
 * Satu tombol aksi berbentuk ikon.
 *
 * `label` wajib, jadi aria-label sekaligus tooltip. Beri `href`
 * untuk navigasi, atau biarkan kosong + `disabled` untuk aksi yang
 * sedang tidak tersedia (mis. PO yang sudah diterima tidak bisa
 * dibatalkan) sehingga posisinya tetap konsisten antar baris.
 */
export function IconAction({
  icon: Icon,
  label,
  href,
  tone = "default",
  external = false,
  disabled = false,
  size = 15,
}: {
  icon: IconType;
  label: string;
  href?: string;
  tone?: ActionTone;
  /** buka di tab baru, dipakai untuk halaman cetak */
  external?: boolean;
  disabled?: boolean;
  size?: number;
}) {
  const body = <Icon size={size} strokeWidth={2} />;

  if (disabled || !href) {
    return (
      <ActionTip label={label}>
        <span
          aria-label={label}
          aria-disabled="true"
          className={iconActionClass(tone, true)}
        >
          {body}
        </span>
      </ActionTip>
    );
  }

  return (
    <ActionTip label={label}>
      <Link
        href={href}
        aria-label={label}
        className={iconActionClass(tone)}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {body}
      </Link>
    </ActionTip>
  );
}

/**
 * Grup ikon aksi. Jarak antar tombol konsisten (bukan mepet) dan
 * rata kanan mengikuti kolom aksi.
 */
export default function RowActions({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center justify-end gap-0.5 md:gap-1">
      {children}
    </div>
  );
}
