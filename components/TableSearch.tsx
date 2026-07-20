"use client";

/* ============================================================
   TableSearch — pencarian & filter instan untuk tabel data.
   Bekerja client-side: menyaring <tbody> <tr> di halaman ini
   berdasarkan teks (search) dan kecocokan persis (filter badge/
   status). Tidak perlu reload — hasil langsung terlihat.
   ============================================================ */

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

export type TableFilterDef = {
  label: string; // placeholder dropdown, mis. "Semua Status"
  options: string[]; // nilai yang dicocokkan PERSIS dengan isi sel/badge
};

// Baris cocok bila ada elemen (td/span/div) yang teksnya persis sama.
// Dipakai untuk filter status — "Lunas" tidak ikut menangkap "Belum Lunas".
function rowHasExact(tr: Element, value: string) {
  const v = value.trim().toLowerCase();
  for (const el of Array.from(tr.querySelectorAll("td, span, div"))) {
    if ((el.textContent || "").trim().toLowerCase() === v) return true;
  }
  return false;
}

export default function TableSearch({
  placeholder = "Cari...",
  filters = [],
}: {
  placeholder?: string;
  filters?: TableFilterDef[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<string[]>(() => filters.map(() => ""));
  const [count, setCount] = useState<{ shown: number; total: number } | null>(
    null
  );

  useEffect(() => {
    const root = ref.current?.closest("main") ?? document.body;

    const apply = () => {
      const rows = root.querySelectorAll<HTMLTableRowElement>("tbody tr");
      const needle = q.trim().toLowerCase();
      let shown = 0;
      let total = 0;
      rows.forEach((tr) => {
        // Baris "empty state" (satu sel colspan lebar) dilewati
        if (tr.cells.length === 1 && tr.cells[0].colSpan > 1) return;
        total++;
        let ok =
          !needle || (tr.textContent || "").toLowerCase().includes(needle);
        if (ok) {
          for (const val of active) {
            if (!val) continue;
            if (!rowHasExact(tr, val)) {
              ok = false;
              break;
            }
          }
        }
        tr.style.display = ok ? "" : "none";
        if (ok) shown++;
      });
      setCount((prev) =>
        total === 0
          ? null
          : prev && prev.shown === shown && prev.total === total
            ? prev
            : { shown, total }
      );
    };

    apply();

    // Kalau isi tabel berubah (navigasi/refresh data), terapkan ulang
    const mo = new MutationObserver((muts) => {
      if (muts.some((m) => m.type === "childList")) apply();
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [q, active]);

  const hasFilter = q.trim() !== "" || active.some((a) => a !== "");

  return (
    <div
      ref={ref}
      className="print-hide flex flex-wrap items-center gap-2 mb-3"
    >
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

      {filters.map((f, i) => (
        <select
          key={f.label}
          value={active[i]}
          onChange={(e) =>
            setActive((a) => a.map((v, j) => (j === i ? e.target.value : v)))
          }
          className="glass-input rounded-lg px-3 text-[13px] w-[calc(50%-4px)] sm:w-auto focus:outline-none focus:ring-2 focus:ring-botanical-700"
        >
          <option value="">{f.label}</option>
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ))}

      {count && (
        <span className="text-[12px] text-muted ml-auto whitespace-nowrap">
          {hasFilter ? `${count.shown} dari ${count.total} baris` : `${count.total} baris`}
        </span>
      )}
    </div>
  );
}
