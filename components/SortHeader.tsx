"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

/* ============================================================
   Tombol urut di judul kolom.

   Urutannya disimpan di URL (`?sort=kode&dir=asc`), bukan di state
   komponen. Tiga alasannya menentukan:

   - Dua puluh empat tabel daftar di aplikasi ini paginasi di SERVER.
     Mengurutkan di browser cuma membalik 50 baris yang sedang tampil,
     dan hasilnya kelihatan benar padahal isinya "halaman 3 urutan lama,
     lalu diurutkan". Lewat URL, halamannya bisa meneruskan urutan itu
     ke .order() di database.
   - Urutan jadi bisa di-refresh, di-share, dan tombol Kembali browser
     bekerja. Sama persis dengan alasan Pagination menyimpan nomor
     halaman di URL.
   - DataTable tetap server component. Yang butuh JS cuma tombol kecil
     ini, bukan seluruh tabel.

   Tiga keadaan, sengaja bukan dua: klik pertama naik, kedua turun,
   ketiga KEMBALI ke urutan bawaan. Urutan bawaan di sini bermakna
   (dokumen terbaru di atas), jadi harus ada jalan pulang.
   ============================================================ */

export type SortDir = "asc" | "desc";

export default function SortHeader({
  sortKey,
  label,
  align = "left",
}: {
  sortKey: string;
  label: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const aktif = params.get("sort") === sortKey;
  const dir: SortDir = params.get("dir") === "desc" ? "desc" : "asc";

  function klik() {
    const sp = new URLSearchParams(params.toString());
    if (!aktif) {
      sp.set("sort", sortKey);
      sp.delete("dir");
    } else if (dir === "asc") {
      sp.set("sort", sortKey);
      sp.set("dir", "desc");
    } else {
      sp.delete("sort");
      sp.delete("dir");
    }
    // Urutan berubah berarti isi halaman 1 berubah. Tetap di halaman 7
    // sesudah menyortir hampir selalu bukan yang dimaui orang.
    sp.delete("page");
    const qs = sp.toString();
    startTransition(() =>
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    );
  }

  const Ikon = !aktif ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;

  return (
    <button
      type="button"
      onClick={klik}
      disabled={pending}
      aria-label={`Urutkan menurut ${typeof label === "string" ? label : sortKey}`}
      title={
        !aktif
          ? "Urutkan menaik"
          : dir === "asc"
            ? "Urutkan menurun"
            : "Kembali ke urutan bawaan"
      }
      className={`group inline-flex items-center gap-1 max-w-full transition-colors hover:text-ink disabled:opacity-50 ${
        align === "right"
          ? "flex-row-reverse"
          : align === "center"
            ? "justify-center"
            : ""
      } ${aktif ? "text-ink" : ""}`}
    >
      <span className="truncate">{label}</span>
      <Ikon
        size={13}
        aria-hidden="true"
        className={`shrink-0 transition-opacity ${
          aktif ? "opacity-100" : "opacity-35 group-hover:opacity-70"
        }`}
      />
    </button>
  );
}

/* ============================================================
   Versi kartu HP.

   Di bawah 768px tabelnya dibongkar jadi kartu dan tidak punya baris
   judul sama sekali, jadi tombol di atas tidak ada tempatnya. Tanpa ini
   sortir cuma bisa dipakai orang yang memegang laptop, padahal isian
   data di pabrik justru dilakukan dari HP.
   ============================================================ */

export function SortSelect({
  options,
}: {
  options: { key: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const sort = params.get("sort") || "";
  const dir: SortDir = params.get("dir") === "desc" ? "desc" : "asc";
  const nilai = sort ? `${sort}:${dir}` : "";

  function ganti(v: string) {
    const sp = new URLSearchParams(params.toString());
    if (!v) {
      sp.delete("sort");
      sp.delete("dir");
    } else {
      const [k, d] = v.split(":");
      sp.set("sort", k);
      if (d === "desc") sp.set("dir", "desc");
      else sp.delete("dir");
    }
    sp.delete("page");
    const qs = sp.toString();
    startTransition(() =>
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    );
  }

  return (
    <label className="md:hidden flex items-center gap-2 mb-2 text-[12px] text-muted">
      Urutkan
      <select
        value={nilai}
        disabled={pending}
        onChange={(e) => ganti(e.target.value)}
        className="flex-1 min-w-0 glass-input rounded-lg px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-botanical-700 disabled:opacity-50"
      >
        <option value="">Bawaan</option>
        {options.map((o) => (
          <optgroup key={o.key} label={o.label}>
            <option value={`${o.key}:asc`}>{o.label} (naik)</option>
            <option value={`${o.key}:desc`}>{o.label} (turun)</option>
          </optgroup>
        ))}
      </select>
    </label>
  );
}
