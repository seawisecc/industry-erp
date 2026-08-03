"use client";

/* ============================================================
   Pencarian & filter tabel — dikirim ke SERVER lewat URL.

   Pengganti TableSearch yang lama (menyaring <tr> di browser).
   Bedanya penting: yang lama cuma bisa melihat baris yang kebetulan
   ter-render, jadi begitu data dipaginasi hasil pencariannya jadi
   menyesatkan. Yang ini menaruh q/filter/page di URL, database yang
   menyaring, dan jumlah baris yang ditampilkan adalah jumlah asli.

   URL-nya juga jadi bisa di-bookmark & di-share.
   ============================================================ */

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import type { PageInfo } from "@/lib/pagination";

export type ToolbarFilter = {
  /** nama parameter URL, mis. "status" */
  param: string;
  /** teks pilihan kosong, mis. "Semua Status" */
  label: string;
  /** value dikirim ke server; label yang dilihat user */
  options: { value: string; label: string }[];
};

export default function TableToolbar({
  placeholder = "Cari...",
  filters = [],
  info,
}: {
  placeholder?: string;
  filters?: ToolbarFilter[];
  info: PageInfo;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(() => params.get("q") ?? "");

  function push(mutate: (sp: URLSearchParams) => void) {
    const sp = new URLSearchParams(window.location.search);
    mutate(sp);
    sp.delete("page"); // ganti kata kunci/filter selalu balik ke halaman 1
    const qs = sp.toString();
    startTransition(() =>
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    );
  }

  // Tunda kirim supaya tidak query tiap ketikan
  useEffect(() => {
    const t = setTimeout(() => {
      const sp = new URLSearchParams(window.location.search);
      if ((sp.get("q") ?? "") === q) return;
      push((s) => (q ? s.set("q", q) : s.delete("q")));
    }, 350);
    return () => clearTimeout(t);
    // `push` stabil untuk keperluan ini (hanya pakai router/pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, pathname, router]);

  const adaFilter = q.trim() !== "" || filters.some((f) => params.get(f.param));

  return (
    <div className="print-hide flex flex-wrap items-center gap-2 mb-3">
      <div className="relative w-full sm:w-64">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full h-[42px] glass-input rounded-lg pl-9 pr-8 text-[13px] focus:outline-none focus:ring-2 focus:ring-botanical-700"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink p-1"
            title="Bersihkan"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {filters.map((f) => (
        <select
          key={f.param}
          value={params.get(f.param) ?? ""}
          onChange={(e) =>
            push((s) =>
              e.target.value ? s.set(f.param, e.target.value) : s.delete(f.param)
            )
          }
          className="glass-input rounded-lg px-3 text-[13px] w-[calc(50%-4px)] sm:w-auto focus:outline-none focus:ring-2 focus:ring-botanical-700"
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}

      <span className="text-[12px] text-muted ml-auto whitespace-nowrap flex items-center gap-2">
        {pending && (
          <span className="inline-block w-3 h-3 border-2 border-botanical-700/30 border-t-botanical-700 rounded-full animate-spin" />
        )}
        {info.total === 0
          ? adaFilter
            ? "Tidak ada yang cocok"
            : "0 baris"
          : `${info.from.toLocaleString("id-ID")}–${info.to.toLocaleString(
              "id-ID"
            )} dari ${info.total.toLocaleString("id-ID")}`}
      </span>
    </div>
  );
}
