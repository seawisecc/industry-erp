"use client";

/* ============================================================
   Pemilih client ketik-cari, menggantikan dropdown panjang.
   Ketik sebagian nama/kode, daftar menyaring otomatis.
   Dipakai di form Invoice, POS, dan Konsinyasi.
   ============================================================ */

import { useState } from "react";
import { X } from "lucide-react";

export type ClientOption = {
  id: string;
  kode: string | null;
  company_brand: string;
};

export default function ClientPicker({
  clients,
  value,
  onChange,
  placeholder = "Ketik nama client...",
  allowEmpty = false,
  emptyLabel = "Tanpa client (walk-in)",
}: {
  clients: ClientOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Izinkan tidak memilih client (mis. POS walk-in). */
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = clients.find((c) => c.id === value) || null;

  const options = () => {
    const q = query.trim().toLowerCase();
    const list = q
      ? clients.filter(
          (c) =>
            c.company_brand.toLowerCase().includes(q) ||
            (c.kode || "").toLowerCase().includes(q)
        )
      : clients;
    return list.slice(0, 30);
  };

  if (selected) {
    return (
      <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
        <span className="truncate flex-1">
          {selected.kode ? (
            <span className="text-muted font-mono text-[12px]">
              {selected.kode}{" "}
            </span>
          ) : null}
          {selected.company_brand}
        </span>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
          }}
          className="text-muted hover:text-clay-600 flex-shrink-0"
          title="Ganti client"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  const list = options();

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
      />
      {open && (list.length > 0 || allowEmpty) && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-50 max-h-56 overflow-y-auto">
          {allowEmpty && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange("");
                setQuery("");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-[13px] text-muted hover:bg-white/60 border-b border-line"
            >
              {emptyLabel}
            </button>
          )}
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c.id);
                setQuery("");
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-[13px] hover:bg-white/60 truncate"
            >
              {c.kode && (
                <span className="text-muted font-mono text-[12px]">{c.kode}, </span>
              )}
              {c.company_brand}
            </button>
          ))}
        </div>
      )}
      {open && query && list.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg z-50 px-3 py-2.5 text-[12.5px] text-muted">
          Client tidak ditemukan.
        </div>
      )}
    </div>
  );
}
