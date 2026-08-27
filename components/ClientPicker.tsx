"use client";

/* ============================================================
   Pemilih client ketik-cari, menggantikan dropdown panjang.
   Ketik sebagian nama/kode, daftar menyaring otomatis.
   Dipakai di form Invoice, POS, dan Konsinyasi.
   ============================================================ */

import { useState } from "react";
import { X } from "lucide-react";
import { klasSorot, tombolCombo } from "@/lib/keyboard";

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
  const [sorot, setSorot] = useState(0);

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
  // Satu larik saran, "tanpa client" ikut jadi baris pertama supaya
  // panah atas/bawah memperlakukannya sama dengan client lain.
  const saran: (ClientOption | null)[] = allowEmpty ? [null, ...list] : list;

  function pilih(i: number) {
    const c = saran[i];
    onChange(c ? c.id : "");
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setSorot(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) =>
          tombolCombo(e, {
            jumlah: saran.length,
            sorot,
            setSorot,
            buka: open,
            setBuka: setOpen,
            pilih,
          })
        }
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-controls="daftar-client"
        className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
      />
      {open && saran.length > 0 && (
        <div
          id="daftar-client"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-50 max-h-56 overflow-y-auto"
        >
          {saran.map((c, i) => (
            <button
              key={c ? c.id : "__kosong"}
              type="button"
              role="option"
              aria-selected={i === sorot}
              tabIndex={-1}
              data-sorot={i === sorot ? "true" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pilih(i);
              }}
              onMouseEnter={() => setSorot(i)}
              className={`w-full text-left px-3 py-2 text-[13px] truncate ${klasSorot(
                i === sorot
              )} ${c ? "" : "text-muted border-b border-line"}`}
            >
              {c === null ? (
                emptyLabel
              ) : (
                <>
                  {c.kode && (
                    <span className="text-muted font-mono text-[12px]">
                      {c.kode},{" "}
                    </span>
                  )}
                  {c.company_brand}
                </>
              )}
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
