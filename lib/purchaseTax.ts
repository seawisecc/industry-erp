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

/**
 * Kalimat yang menerangkan tarif yang berlaku, untuk ditulis di bawah
 * switch. Ada di layar supaya orang tahu dari mana angkanya datang,
 * sekaligus menjawab pertanyaan yang pasti muncul begitu kolom ketik
 * "PPN (%)" dihapus dari form.
 */
export function keteranganTarif(tax: TaxSettings): string {
  const persen = (n: number) =>
    n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  return tax.dppNilaiLain
    ? `Tarif PPN ${persen(tax.taxPercent)}% atas DPP Nilai Lain (11/12 harga), efektif ${persen(tarifEfektif(tax.taxPercent, tax.dppNilaiLain))}%. Diatur di Settings, menu Pajak (PPN).`
    : `Tarif PPN ${persen(tax.taxPercent)}% atas harga penuh. Diatur di Settings, menu Pajak (PPN).`;
}

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
 * Rincian pajak sebuah dokumen yang cuma menyimpan TOTAL-nya, bukan
 * subtotalnya. Dipakai retur pembelian: `purchase_returns.total_nilai`
 * adalah nilai yang dipotongkan dari tagihan, dan rincian DPP/PPN-nya
 * harus dibongkar balik supaya bisa mengurangi pajak masukan.
 *
 * Bukan rumus baru, cuma membalik arahnya: subtotalnya dihitung dulu,
 * lalu diserahkan ke hitungTotalPembelian yang sama.
 */
export function rincianDariTotal(
  total: number,
  mode: PurchaseTaxMode,
  taxPercent: number,
  dppNilaiLain: boolean
): InvoiceTotals {
  const pembagi = 1 + tarifEfektif(taxPercent, dppNilaiLain) / 100;
  // Pada Include totalnya SUDAH sama dengan subtotal: pajaknya di dalam.
  const subtotal =
    mode === "Include" || pembagi <= 0 ? total : total / pembagi;
  return hitungTotalPembelian(subtotal, mode, taxPercent, dppNilaiLain);
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
