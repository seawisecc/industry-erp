"use client";

/* ============================================================
   Pemilih produk-varian ketik-cari, menggantikan dropdown panjang.

   Daftar produk jadi punya satu baris per kombinasi produk × varian,
   jadi <select> gulungnya bisa ratusan baris. Ketik sebagian kode,
   nama produk, nama varian, atau BRAND, daftar menyaring otomatis.

   Brand ikut ditampilkan karena satu pabrik maklon mengerjakan
   produk bernama mirip untuk brand berbeda, dan kode produk pun
   bisa kembar. Tanpa brand, dua baris bisa terbaca persis sama.

   Dipakai di form Invoice, POS, dan Konsinyasi. Baris layanan jasa
   ditandai jelas karena jasa tidak punya stok, jadi angka "stok 0"
   di sebelahnya akan menyesatkan.
   ============================================================ */

import { useState } from "react";
import { X } from "lucide-react";
import { klasSorot, tombolCombo } from "@/lib/keyboard";

export type ProductOption = {
  /** unik: "productId|varian", atau "svc|serviceId" untuk jasa */
  key: string;
  /** "PRD-0001, Serum Wajah (30 g)" */
  label: string;
  /** brand pemilik produk, dirender lebih redup di ekor label */
  brand?: string | null;
  /** "-" bila produk tanpa varian */
  varian: string;
  available: number;
  /** terisi bila baris ini layanan jasa (tidak punya stok) */
  service_id: string | null;
};

/** Maksimal saran yang dirender, supaya daftar panjang tetap ringan. */
const MAX_SARAN = 30;

function StokInfo({ o }: { o: ProductOption }) {
  if (o.service_id) {
    return (
      <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-100 text-amber-500 flex-shrink-0">
        Jasa
      </span>
    );
  }
  return (
    <span
      className={`text-[11.5px] flex-shrink-0 ${
        o.available > 0 ? "text-muted" : "text-clay-600"
      }`}
    >
      stok {o.available.toLocaleString("id-ID")}
    </span>
  );
}

export default function ProductPicker({
  options,
  value,
  onChange,
  placeholder = "Ketik kode / nama produk...",
  showStock = true,
}: {
  options: ProductOption[];
  /** `key` produk terpilih, "" bila belum memilih */
  value: string;
  onChange: (key: string) => void;
  placeholder?: string;
  /**
   * Matikan info stok. Dipakai di layar yang tidak ada hubungannya dengan
   * ketersediaan barang (mis. menyusun daftar harga khusus client), di mana
   * "stok 0" cuma jadi angka menakutkan yang tidak relevan.
   */
  showStock?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [sorot, setSorot] = useState(0);

  const selected = options.find((o) => o.key === value) || null;

  if (selected) {
    return (
      <div className="flex items-center gap-2 glass-input rounded-lg px-3 py-2.5 text-sm">
        <span className="truncate flex-1">
          {selected.label}
          {selected.brand && <span className="text-muted"> · {selected.brand}</span>}
        </span>
        {showStock && <StokInfo o={selected} />}
        <button
          type="button"
          onClick={() => {
            onChange("");
            setQuery("");
          }}
          className="text-muted hover:text-clay-600 flex-shrink-0"
          title="Ganti produk"
          aria-label="Ganti produk"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  // label sudah memuat kode & nama varian, varian ikut dicocokkan
  // supaya "30 g" tetap ketemu pada produk yang labelnya panjang.
  // Brand juga: orang sering ingat brand-nya lebih dulu daripada
  // kode produknya.
  const q = query.trim().toLowerCase();
  const list = (
    q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            o.varian.toLowerCase().includes(q) ||
            (o.brand || "").toLowerCase().includes(q)
        )
      : options
  ).slice(0, MAX_SARAN);

  function pilih(i: number) {
    const o = list[i];
    if (!o) return;
    onChange(o.key);
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
            jumlah: list.length,
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
        aria-controls="daftar-produk"
        className="w-full glass-input rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-botanical-700"
      />
      {open && list.length > 0 && (
        <div
          id="daftar-produk"
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg overflow-hidden z-50 max-h-56 overflow-y-auto"
        >
          {list.map((o, i) => (
            <button
              key={o.key}
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
              className={`w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 ${klasSorot(
                i === sorot
              )}`}
            >
              <span className="truncate flex-1">
                {o.label}
                {o.brand && <span className="text-muted"> · {o.brand}</span>}
              </span>
              {showStock && <StokInfo o={o} />}
            </button>
          ))}
        </div>
      )}
      {open && q && list.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-line shadow-xl rounded-lg z-50 px-3 py-2.5 text-[12.5px] text-muted">
          Produk tidak ditemukan.
        </div>
      )}
    </div>
  );
}
