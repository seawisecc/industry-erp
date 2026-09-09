/* ============================================================
   Pajak sisi PEMBELIAN: modelnya milik SUPPLIER, bukan milik kita.

   Di penjualan, model harga adalah keputusan perusahaan sendiri, jadi
   satu pengaturan di Settings berlaku untuk semua invoice. Di pembelian
   keputusan itu ada di seberang meja: tiap supplier menerbitkan
   fakturnya dengan gayanya sendiri, dan tiga-tiganya ada di lapangan.

     Non      supplier non-PKP, fakturnya tidak memuat PPN sama sekali
     Exclude  harga di faktur belum kena PPN, PPN ditambahkan di bawah
     Include  harga di faktur sudah final, PPN diurai dari dalamnya

   Yang TIDAK berbeda adalah tarifnya. PPN 12% dengan DPP Nilai Lain
   adalah regulasi, sama untuk semua orang, jadi angkanya tetap datang
   dari Settings dan tidak bisa diketik per dokumen. Yang dipilih di form
   cuma modelnya.

   Rumusnya tidak ditulis ulang di sini: hitungTotalPembelian cuma
   memanggil hitungTotalDokumen dengan diskon 0. Sisi pembelian tidak
   punya kolom diskon dokumen, potongan supplier sudah masuk ke harga
   per baris.

   Cerminan SQL-nya invoice_tax_calc(), dipanggil dari create_receiving_tx
   dan create_purchase_return_tx di 20260822_purchase_tax_mode.sql.

   Bersih dari import server, jadi boleh dipakai komponen "use client"
   maupun server action.
   ============================================================ */

import {
  hitungTotalDokumen,
  tarifEfektif,
  type InvoiceTotals,
  type TaxSettings,
} from "@/lib/invoiceMath";

export type PurchaseTaxMode = "Non" | "Exclude" | "Include";

/** Supplier yang belum pernah dikenali dianggap menambahkan PPN. */
export const PURCHASE_TAX_MODE_DEFAULT: PurchaseTaxMode = "Exclude";

export const PURCHASE_TAX_MODES: PurchaseTaxMode[] = [
  "Non",
  "Exclude",
  "Include",
];

/** Label pendek untuk tombol switch. */
export const PURCHASE_TAX_LABEL: Record<PurchaseTaxMode, string> = {
  Non: "Tanpa PPN",
  Exclude: "Exclude",
  Include: "Include",
};

/** Kalimat penjelas di bawah switch. Tanpa angka tarif, itu milik Settings. */
export const PURCHASE_TAX_HINT: Record<PurchaseTaxMode, string> = {
  Non: "Faktur supplier tidak memuat PPN. Total tagihan sama dengan subtotal.",
  Exclude: "Harga di faktur belum termasuk PPN. Pajaknya ditambahkan di bawah subtotal.",
  Include: "Harga di faktur sudah termasuk PPN. Total tidak bertambah, pajaknya diurai dari dalam harga.",
};

/** Baca nilai kolom `tax_mode` apa adanya, apa pun isinya. */
export function parsePurchaseTaxMode(raw: unknown): PurchaseTaxMode {
  return raw === "Non" || raw === "Include" || raw === "Exclude"
    ? raw
    : PURCHASE_TAX_MODE_DEFAULT;
}

/**
 * Sama dengan parsePurchaseTaxMode, tapi membedakan "belum pernah
 * diketahui" (null) dari "memang tanpa PPN" ('Non'). Dipakai untuk
 * bawaan supplier, yang boleh kosong.
 */
export function parseSupplierTaxMode(raw: unknown): PurchaseTaxMode | null {
  return raw === "Non" || raw === "Include" || raw === "Exclude" ? raw : null;
}

/**
 * Tarif yang DIBEKUKAN di dokumen. Nol untuk dokumen tanpa pajak, supaya
 * pembaca lama yang cuma melihat ppn_percent tetap membaca angka yang benar.
 */
export function tarifDokumen(mode: PurchaseTaxMode, tax: TaxSettings): number {
  return mode === "Non" ? 0 : tax.taxPercent;
}

/** Total dokumen pembelian. Satu-satunya jalan masuk ke rumus pajaknya. */
export function hitungTotalPembelian(
  subtotal: number,
  mode: PurchaseTaxMode,
  taxPercent: number,
  dppNilaiLain: boolean
): InvoiceTotals {
  return hitungTotalDokumen(
    subtotal,
    0,
    mode !== "Non",
    taxPercent,
    mode === "Include" ? "Include" : "Exclude",
    dppNilaiLain
  );
}

/** Bentuk yang lebih enak dipanggil dari form, yang memegang TaxSettings utuh. */
export function totalPembelian(
  subtotal: number,
  mode: PurchaseTaxMode,
  tax: TaxSettings
): InvoiceTotals {
  return hitungTotalPembelian(
    subtotal,
    mode,
    tarifDokumen(mode, tax),
    tax.dppNilaiLain
  );
}

/**
 * Harga faktur -> HPP. Pada Include, PPN dikeluarkan dari harganya supaya
 * biaya barang tetap setara dengan pembelian dari supplier Exclude: uang
 * yang keluar sama, jadi HPP-nya tidak boleh berbeda cuma karena gaya
 * penulisan faktur suppliernya.
 *
 * Cerminan v_pembagi di create_receiving_tx (20260822). Dua-duanya wajib
 * ikut berubah bersamaan.
 */
export function hargaExTax(
  harga: number,
  mode: PurchaseTaxMode,
  taxPercent: number,
  dppNilaiLain: boolean
): number {
  if (mode !== "Include") return harga;
  const pembagi = 1 + tarifEfektif(taxPercent, dppNilaiLain) / 100;
  return pembagi > 0 ? harga / pembagi : harga;
}
