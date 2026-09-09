"use client";

import {
  PURCHASE_TAX_HINT,
  PURCHASE_TAX_LABEL,
  PURCHASE_TAX_MODES,
  type PurchaseTaxMode,
} from "@/lib/purchaseTax";

/* ============================================================
   Switch model pajak faktur supplier: Tanpa PPN / Exclude / Include.

   Tiga posisi, bukan satu tombol on-off plus pilihan kedua. Bedanya
   bukan kosmetik: yang dipilih orang di sini adalah SATU fakta tentang
   kertas yang sedang dipegangnya, dan memecahnya jadi dua langkah
   ("kena pajak?" lalu "include?") membuat kombinasi mati yang harus
   dijaga sendiri di tiap form.

   Tarifnya tidak ada di sini. PPN adalah angka regulasi, bukan angka
   yang dinegosiasikan per transaksi, jadi tempatnya di Settings. Yang
   berbeda antar supplier cuma modelnya.
   ============================================================ */

export default function TaxModeSwitch({
  value,
  onChange,
  bawaanSupplier,
  disabled,
  label = "Pajak Faktur Supplier",
}: {
  value: PurchaseTaxMode;
  onChange: (mode: PurchaseTaxMode) => void;
  /** Model yang tersimpan di supplier, untuk menerangkan dari mana isiannya. */
  bawaanSupplier?: PurchaseTaxMode | null;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div>
      <label className="block text-[12.5px] font-medium text-muted mb-1.5">
        {label}
      </label>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex w-full rounded-lg border border-line bg-white/60 p-0.5"
      >
        {PURCHASE_TAX_MODES.map((mode) => {
          const aktif = value === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={aktif}
              disabled={disabled}
              onClick={() => onChange(mode)}
              className={`flex-1 rounded-[7px] px-2 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-50 ${
                aktif
                  ? "bg-botanical-700 text-white shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {PURCHASE_TAX_LABEL[mode]}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted mt-1 leading-snug">
        {PURCHASE_TAX_HINT[value]}
        {bawaanSupplier === value && " Tersimpan sebagai bawaan supplier ini."}
      </p>
    </div>
  );
}
