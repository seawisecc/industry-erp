/* ============================================================
   Label gudang & produksi untuk printer thermal 58 mm.

   Sama kertas, sama lebar cetak, dan sama aturan mainnya dengan
   nota POS di /print/nota: lebarnya dikunci 48 mm (lebar cetak
   nyata printer 58 mm, 384 dot @203 dpi) lewat kelas `.struk-58`,
   tinggi halaman `auto` supaya kertas dipotong tepat di akhir
   label, dan warnanya cuma hitam-putih.

   Bedanya cuma satu dan itu penting: label PUNYA blok hitam pekat
   (kepala status). Browser membuang latar belakang saat mencetak
   kecuali diminta eksplisit, jadi setiap blok hitam di sini wajib
   memakai `blokHitam`, tanpa itu label REJECT keluar dari printer
   sebagai kotak putih kosong, dan itu label yang paling tidak boleh
   salah baca di gudang.

   Satu komponen kepala + satu kotak isi dipakai bersama oleh label
   status (karantina/release/reject) dan label penimbangan, supaya
   ketiganya tidak pelan-pelan jadi tiga desain berbeda.
   ============================================================ */

import type { CSSProperties, ReactNode } from "react";
import { APP_TIMEZONE } from "@/lib/dates";

/**
 * Latar hitam yang IKUT tercetak.
 *
 * Chrome & Safari mematikan pencetakan latar belakang secara default
 * ("Background graphics" tidak dicentang). `print-color-adjust: exact`
 * adalah satu-satunya cara memaksanya, dan versi ber-prefix tetap
 * diperlukan untuk Safari.
 */
export const blokHitam: CSSProperties = {
  backgroundColor: "#000",
  color: "#fff",
  WebkitPrintColorAdjust: "exact",
  printColorAdjust: "exact",
};

const waktuCetakFmt = new Intl.DateTimeFormat("id-ID", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Tanggal kalender (yyyy-mm-dd) apa adanya, tanpa geser zona. */
export function tanggalLabel(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("id-ID", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Stempel "dicetak pada" di kaki label. */
export function waktuCetak(d: Date = new Date()) {
  return waktuCetakFmt.format(d);
}

/** Halaman cetak: ukuran kertas + latar putih saat print. */
export function LabelPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen py-4 print:py-0 print:min-h-0">
      <style>{`
        @page { size: 58mm auto; margin: 0; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
        }
      `}</style>
      {children}
    </div>
  );
}

/**
 * Satu lembar label.
 *
 * `terakhir` mematikan page-break supaya printer tidak memuntahkan
 * satu halaman kosong di akhir. Pemutus halaman dipasang di elemen
 * blok ini, bukan di pembungkus flex-nya: pemenggalan halaman di
 * dalam flex container tidak dijamin browser.
 */
export function LabelSheet({
  children,
  terakhir = true,
}: {
  children: ReactNode;
  terakhir?: boolean;
}) {
  return (
    <div className="flex justify-center print:block">
      <div
        className="struk-58 bg-white text-black text-[9.5px] leading-[1.3] px-[2mm] py-[2.5mm] mb-6 print:mb-0 shadow-xl print:shadow-none"
        style={terakhir ? undefined : { breakAfter: "page" }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Kepala label: nama perusahaan kecil, lalu pita status hitam.
 *
 * `judul` sengaja dibiarkan membungkus (bukan `whitespace-nowrap`):
 * di 48 mm, "LABEL PENIMBANGAN" tidak muat satu baris dan lebih baik
 * turun daripada terpotong di tepi kertas.
 */
export function LabelHeader({
  org,
  judul,
  subjudul,
}: {
  org?: string | null;
  judul: string;
  subjudul?: string | null;
}) {
  return (
    <>
      {org && (
        <div className="text-center text-[8px] uppercase tracking-[0.08em] font-semibold break-words mb-[1mm]">
          {org}
        </div>
      )}
      <div
        className="border-2 border-black px-[1mm] py-[1.5mm] text-center"
        style={blokHitam}
      >
        <div className="text-[13px] font-bold tracking-[0.22em] leading-tight break-words">
          {judul}
        </div>
        {subjudul && (
          <div className="text-[7.5px] tracking-[0.12em] uppercase mt-[0.5mm]">
            {subjudul}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Kotak isi label. Garis atasnya sengaja dihilangkan karena sudah
 * dipegang oleh pita status di atasnya, dua garis 2px yang menempel
 * terbaca sebagai garis tebal yang tidak rata.
 */
export function LabelBox({ children }: { children: ReactNode }) {
  return (
    <div className="border-2 border-t-0 border-black divide-y-2 divide-black">
      {children}
    </div>
  );
}

/** Dua field berdampingan dalam satu baris kotak. */
export function FieldPair({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 divide-x-2 divide-black">{children}</div>
  );
}

/**
 * Satu field.
 *
 * Nilai yang tidak ada di sistem (mis. kedaluwarsa produk jadi, yang
 * memang belum disimpan di mana pun) TIDAK dicetak sebagai "-", tapi
 * jadi garis kosong untuk ditulis tangan, persis seperti formulir
 * label yang selama ini dipakai. "-" akan terbaca sebagai "tidak ada
 * kedaluwarsa", dan itu salah.
 */
export function Field({
  label,
  value,
  mono = false,
  besar = false,
}: {
  label: string;
  value?: ReactNode;
  mono?: boolean;
  besar?: boolean;
}) {
  const kosong =
    value === null || value === undefined || value === "" || value === false;
  return (
    <div className="px-[1.5mm] py-[1mm] min-w-0">
      <div className="text-[7px] uppercase tracking-[0.08em] font-semibold">
        {label}
      </div>
      {kosong ? (
        <div className="mt-[1.5mm] mb-[0.5mm] border-b border-dotted border-black h-0" />
      ) : (
        <div
          className={[
            "font-bold leading-snug break-words",
            besar ? "text-[12px]" : "text-[10.5px]",
            mono ? "font-mono" : "",
          ].join(" ")}
        >
          {value}
        </div>
      )}
    </div>
  );
}

/** Ruang tanda tangan petugas. Nama dicetak bila sistem tahu siapa. */
export function SignField({
  label,
  nama,
}: {
  label: string;
  nama?: string | null;
}) {
  return (
    <div className="px-[1.5mm] py-[1mm]">
      <div className="text-[7px] uppercase tracking-[0.08em] font-semibold">
        {label}
      </div>
      <div className="h-[11mm]" />
      <div className="border-t border-black pt-[0.5mm] text-center text-[9px] font-medium break-words">
        {nama || " "}
      </div>
    </div>
  );
}

/**
 * Kaki label + ruang potong.
 *
 * Printer thermal memotong beberapa milimeter di atas ujung cetak,
 * jadi tanpa ruang kosong ini baris terakhir ikut terpotong.
 */
export function LabelFooter({ jejak }: { jejak: string }) {
  return (
    <>
      <div className="mt-[1.5mm] text-center text-[7px] leading-tight break-words">
        {jejak}
      </div>
      <div className="h-[8mm]" />
    </>
  );
}
